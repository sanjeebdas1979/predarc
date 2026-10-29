"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { useAccount, useSignTypedData, useSwitchChain } from "wagmi";
import type { Address, Hex } from "viem";

import { usePredarcSession } from "@/app/components/providers/PredarcSessionProvider";
import { usePredarcNetwork } from "@/app/components/providers/PredarcNetworkProvider";
import {
  PAID_RESEARCH_CALL_CAPS,
  PAID_RESEARCH_DAILY_CAPS,
  PAID_RESEARCH_DAILY_LIMIT,
  PAID_RESEARCH_MODEL,
  parsePaidResearchExecuteResponse,
  parsePaidResearchQuote,
  parsePaidResearchReceipt,
  type PaidResearchQuote,
  type PaidResearchReceipt,
} from "@/lib/agent-research-paid-core";
import {
  AGENT_RESEARCH_DURATIONS,
  AGENT_RESEARCH_MARKETS,
  formatResearchUsdc,
  type AgentResearchDuration,
  type AgentResearchMarket,
} from "@/lib/agent-research-core";

type MessageTone = "info" | "success" | "error";

const DURATION_LABELS: Record<AgentResearchDuration, string> = {
  60: "1 minute",
  300: "5 minutes",
  900: "15 minutes",
  3600: "1 hour",
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

async function readJson(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

function responseError(value: unknown, fallback: string): string {
  return isRecord(value) && typeof value.error === "string"
    ? value.error
    : fallback;
}

function readableError(error: unknown, fallback: string): string {
  if (!(error instanceof Error)) return fallback;
  const lower = error.message.toLowerCase();
  if (lower.includes("rejected") || lower.includes("denied")) {
    return "Payment authorization was cancelled in your wallet. No request was sent.";
  }
  return error.message.length <= 220 ? error.message : fallback;
}

function parseHistory(value: unknown): {
  receipts: PaidResearchReceipt[];
  runsLast24Hours: number;
  dailyLimit: number;
  spentAtomic: string;
} | null {
  if (!isRecord(value) || !Array.isArray(value.receipts) || !isRecord(value.usage)) {
    return null;
  }
  const receipts = value.receipts.map(parsePaidResearchReceipt);
  if (
    receipts.some((receipt) => !receipt) ||
    !Number.isSafeInteger(value.usage.runsLast24Hours) ||
    !Number.isSafeInteger(value.usage.dailyLimit) ||
    typeof value.usage.spentAtomic !== "string" ||
    !/^\d+$/.test(value.usage.spentAtomic)
  ) {
    return null;
  }
  return {
    receipts: receipts as PaidResearchReceipt[],
    runsLast24Hours: value.usage.runsLast24Hours as number,
    dailyLimit: value.usage.dailyLimit as number,
    spentAtomic: value.usage.spentAtomic,
  };
}

function signalClasses(signal: PaidResearchReceipt["signal"]): string {
  if (signal === "higher") {
    return "border-emerald-400/30 bg-emerald-400/10 text-emerald-200";
  }
  if (signal === "lower") {
    return "border-red-400/30 bg-red-400/10 text-red-200";
  }
  return "border-amber-400/30 bg-amber-400/10 text-amber-200";
}

function shortDate(value: string): string {
  return new Intl.DateTimeFormat("en", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

export default function PaidAgentResearchPanel() {
  const { session, isSignedIn } = usePredarcSession();
  const { selectedChainId, network } = usePredarcNetwork();
  const { chainId } = useAccount();
  const { switchChainAsync, isPending: isSwitching } = useSwitchChain();
  const { signTypedDataAsync } = useSignTypedData();
  const [market, setMarket] = useState<AgentResearchMarket>("BTC");
  const [durationSeconds, setDurationSeconds] =
    useState<AgentResearchDuration>(300);
  const [maxCostAtomic, setMaxCostAtomic] = useState("5000");
  const [dailyCostCapAtomic, setDailyCostCapAtomic] = useState("25000");
  const [quote, setQuote] = useState<PaidResearchQuote | null>(null);
  const [receipts, setReceipts] = useState<PaidResearchReceipt[]>([]);
  const [currentReceipt, setCurrentReceipt] =
    useState<PaidResearchReceipt | null>(null);
  const [runsLast24Hours, setRunsLast24Hours] = useState(0);
  const [dailyLimit, setDailyLimit] = useState(PAID_RESEARCH_DAILY_LIMIT);
  const [spentAtomic, setSpentAtomic] = useState("0");
  const [isLoading, setIsLoading] = useState(false);
  const [isQuoting, setIsQuoting] = useState(false);
  const [isExecuting, setIsExecuting] = useState(false);
  const [message, setMessage] = useState("");
  const [messageTone, setMessageTone] = useState<MessageTone>("info");
  const [clock, setClock] = useState(0);
  const pendingRequestId = useRef("");

  const clearQuote = useCallback(() => {
    setQuote(null);
    setClock(0);
    pendingRequestId.current = "";
  }, []);

  const loadHistory = useCallback(async () => {
    if (!isSignedIn || session?.chainId !== selectedChainId) {
      setReceipts([]);
      setRunsLast24Hours(0);
      setSpentAtomic("0");
      return;
    }
    setIsLoading(true);
    try {
      const response = await fetch("/api/agents/research/paid", {
        credentials: "same-origin",
        cache: "no-store",
      });
      const result = await readJson(response);
      if (!response.ok) {
        throw new Error(responseError(result, "Unable to load paid research history."));
      }
      const parsed = parseHistory(result);
      if (!parsed) throw new Error("Predarc returned an unexpected paid history response.");
      setReceipts(parsed.receipts);
      setRunsLast24Hours(parsed.runsLast24Hours);
      setDailyLimit(parsed.dailyLimit);
      setSpentAtomic(parsed.spentAtomic);
    } catch (error) {
      setMessageTone("error");
      setMessage(readableError(error, "Unable to load paid research history."));
    } finally {
      setIsLoading(false);
    }
  }, [isSignedIn, selectedChainId, session?.chainId]);

  useEffect(() => {
    const timeout = window.setTimeout(() => void loadHistory(), 0);
    return () => window.clearTimeout(timeout);
  }, [loadHistory]);

  useEffect(() => {
    if (!quote) return;
    const interval = window.setInterval(() => setClock(Date.now()), 1_000);
    return () => window.clearInterval(interval);
  }, [quote]);

  async function getQuote() {
    setMessage("");
    if (!isSignedIn || !session) {
      setMessageTone("error");
      setMessage("Connect your wallet and sign in to Predarc first.");
      return;
    }
    if (session.chainId !== selectedChainId) {
      setMessageTone("error");
      setMessage(`Sign in to Predarc with ${network.label} before requesting a paid quote.`);
      return;
    }
    if (chainId !== selectedChainId) {
      try {
        await switchChainAsync({ chainId: selectedChainId });
      } catch (error) {
        setMessageTone("error");
        setMessage(readableError(error, `Switch to ${network.label} first.`));
        return;
      }
    }

    setIsQuoting(true);
    try {
      const requestId = pendingRequestId.current || crypto.randomUUID();
      pendingRequestId.current = requestId;
      const response = await fetch("/api/agents/research/paid/quote", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          requestId,
          market,
          durationSeconds,
          model: PAID_RESEARCH_MODEL,
          maxCostAtomic,
          dailyCostCapAtomic,
        }),
      });
      const result = await readJson(response);
      const parsed = isRecord(result) ? parsePaidResearchQuote(result.quote) : null;
      if (!response.ok || !parsed) {
        if (response.status === 409) clearQuote();
        throw new Error(responseError(result, "Unable to prepare a Mainnet quote."));
      }
      setQuote(parsed);
      setClock(Date.now());
      setMessageTone("success");
      setMessage(
        `Quote ready: ${formatResearchUsdc(parsed.amountAtomic)} USDC. Review it before signing.`
      );
    } catch (error) {
      setMessageTone("error");
      setMessage(readableError(error, "Unable to prepare a Mainnet quote."));
    } finally {
      setIsQuoting(false);
    }
  }

  async function signAndRun() {
    setMessage("");
    if (!quote || Date.parse(quote.expiresAt) <= Date.now()) {
      clearQuote();
      setMessageTone("error");
      setMessage("The quote expired. Get a fresh Mainnet quote.");
      return;
    }
    if (!session || session.wallet.toLowerCase() !== quote.wallet) {
      clearQuote();
      setMessageTone("error");
      setMessage("The signed-in wallet no longer matches this quote.");
      return;
    }

    setIsExecuting(true);
    try {
      if (chainId !== quote.chainId) {
        await switchChainAsync({ chainId: quote.chainId });
      }
      const typedData = quote.typedData;
      const signature = await signTypedDataAsync({
        domain: {
          ...typedData.domain,
          verifyingContract: typedData.domain.verifyingContract as Address,
        },
        types: typedData.types,
        primaryType: typedData.primaryType,
        message: {
          from: typedData.message.from as Address,
          to: typedData.message.to as Address,
          value: BigInt(typedData.message.value),
          validAfter: BigInt(typedData.message.validAfter),
          validBefore: BigInt(typedData.message.validBefore),
          nonce: typedData.message.nonce as Hex,
        },
      });
      const response = await fetch("/api/agents/research/paid/execute", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ quoteId: quote.quoteId, signature }),
      });
      const result = await readJson(response);
      if (!response.ok) {
        clearQuote();
        throw new Error(responseError(result, "Paid analysis could not be completed."));
      }
      const parsed = parsePaidResearchExecuteResponse(result);
      if (!parsed) throw new Error("Predarc returned an unexpected paid receipt.");
      setCurrentReceipt(parsed.receipt);
      setQuote(null);
      pendingRequestId.current = "";
      setMessageTone("success");
      setMessage(
        parsed.receipt.spending.status === "not-charged"
          ? "AI analysis completed. The provider skipped settlement, so 0 USDC was charged."
          : `AI analysis completed and ${formatResearchUsdc(parsed.receipt.spending.actualCostAtomic)} USDC was recorded.`
      );
      await loadHistory();
    } catch (error) {
      setMessageTone("error");
      setMessage(readableError(error, "Paid analysis could not be completed."));
    } finally {
      setIsExecuting(false);
    }
  }

  const quoteExpired = quote ? Date.parse(quote.expiresAt) <= clock : false;
  const quoteSeconds = quote
    ? Math.max(0, Math.ceil((Date.parse(quote.expiresAt) - clock) / 1_000))
    : 0;

  return (
    <section className="mt-6 rounded-3xl border border-violet-400/25 bg-[radial-gradient(circle_at_top_right,rgba(139,92,246,0.13),transparent_40%),#0d121a] p-5 sm:p-7">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-xs font-black uppercase tracking-[0.18em] text-violet-300">
              Paid AI research
            </p>
            <span className="rounded-full border border-emerald-400/25 bg-emerald-400/[0.07] px-3 py-1 text-[10px] font-black uppercase tracking-[0.14em] text-emerald-200">
              {network.label}
            </span>
          </div>
          <h2 className="mt-2 text-2xl font-black sm:text-3xl">
            Pay per model call from your connected wallet
          </h2>
          <p className="mt-3 max-w-3xl text-sm leading-6 text-gray-300">
            Predarc obtains an exact BlockRun x402 quote, checks it against your
            limits, then asks your wallet to sign a one-time USDC authorization.
            Predarc never receives or stores your private key.
          </p>
        </div>
        <div className="rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-right">
          <p className="text-[10px] font-black uppercase tracking-[0.14em] text-gray-500">
            Rolling 24h usage
          </p>
          <p className="mt-1 text-sm font-black text-white">
            {runsLast24Hours}/{dailyLimit} calls · {formatResearchUsdc(spentAtomic)} USDC
          </p>
        </div>
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(320px,0.72fr)]">
        <div>
          <fieldset>
            <legend className="text-sm font-bold text-gray-200">Market</legend>
            <div className="mt-2 flex flex-wrap gap-2">
              {AGENT_RESEARCH_MARKETS.map((option) => (
                <button
                  key={option}
                  type="button"
                  aria-pressed={market === option}
                  onClick={() => {
                    clearQuote();
                    setMarket(option);
                  }}
                  className={`rounded-full border px-4 py-2 text-xs font-black transition ${
                    market === option
                      ? "border-violet-400/50 bg-violet-400/15 text-violet-100"
                      : "border-white/10 bg-white/[0.03] text-gray-400 hover:text-white"
                  }`}
                >
                  {option}
                </button>
              ))}
            </div>
          </fieldset>

          <fieldset className="mt-5">
            <legend className="text-sm font-bold text-gray-200">Forecast horizon</legend>
            <div className="mt-2 flex flex-wrap gap-2">
              {AGENT_RESEARCH_DURATIONS.map((option) => (
                <button
                  key={option}
                  type="button"
                  aria-pressed={durationSeconds === option}
                  onClick={() => {
                    clearQuote();
                    setDurationSeconds(option);
                  }}
                  className={`rounded-full border px-4 py-2 text-xs font-black transition ${
                    durationSeconds === option
                      ? "border-cyan-400/50 bg-cyan-400/15 text-cyan-100"
                      : "border-white/10 bg-white/[0.03] text-gray-400 hover:text-white"
                  }`}
                >
                  {DURATION_LABELS[option]}
                </button>
              ))}
            </div>
          </fieldset>

          <div className="mt-5 grid gap-4 sm:grid-cols-2">
            <label>
              <span className="text-sm font-bold text-gray-200">Maximum per call</span>
              <select
                value={maxCostAtomic}
                onChange={(event) => {
                  clearQuote();
                  setMaxCostAtomic(event.target.value);
                  if (BigInt(dailyCostCapAtomic) < BigInt(event.target.value)) {
                    setDailyCostCapAtomic(event.target.value);
                  }
                }}
                className="mt-2 w-full rounded-xl border border-white/10 bg-[#080c12] px-4 py-3 outline-none focus:border-violet-400/60"
              >
                {PAID_RESEARCH_CALL_CAPS.map((amount) => (
                  <option key={amount} value={amount}>
                    {formatResearchUsdc(amount)} USDC
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span className="text-sm font-bold text-gray-200">Rolling 24h cap</span>
              <select
                value={dailyCostCapAtomic}
                onChange={(event) => {
                  clearQuote();
                  setDailyCostCapAtomic(event.target.value);
                }}
                className="mt-2 w-full rounded-xl border border-white/10 bg-[#080c12] px-4 py-3 outline-none focus:border-violet-400/60"
              >
                {PAID_RESEARCH_DAILY_CAPS.filter(
                  (amount) => BigInt(amount) >= BigInt(maxCostAtomic)
                ).map((amount) => (
                  <option key={amount} value={amount}>
                    {formatResearchUsdc(amount)} USDC
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div className="mt-5 flex flex-wrap gap-3">
            <button
              type="button"
              disabled={!isSignedIn || isQuoting || isExecuting || isSwitching}
              onClick={() => void getQuote()}
              className="rounded-xl border border-violet-400/35 bg-violet-400/10 px-5 py-3 text-sm font-black text-violet-100 disabled:opacity-45"
            >
              {isQuoting ? "Checking exact price…" : `Get ${network.shortLabel} quote`}
            </button>
            <button
              type="button"
              disabled={!quote || quoteExpired || isExecuting || isQuoting}
              onClick={() => void signAndRun()}
              className="predarc-gradient-button disabled:opacity-45"
            >
              {isExecuting ? "Submitting one-time authorization…" : "Sign & run paid analysis"}
            </button>
          </div>
        </div>

        <aside className="rounded-2xl border border-white/10 bg-black/20 p-5">
          <p className="text-xs font-black uppercase tracking-[0.16em] text-cyan-300">
            Exact quote
          </p>
          {quote ? (
            <dl className="mt-4 space-y-4 text-sm">
              <div>
                <dt className="text-xs text-gray-500">Model</dt>
                <dd className="mt-1 break-words font-bold text-white">{quote.model}</dd>
              </div>
              <div>
                <dt className="text-xs text-gray-500">Maximum authorized amount</dt>
                <dd className="mt-1 text-2xl font-black text-emerald-300">
                  {formatResearchUsdc(quote.amountAtomic)} USDC
                </dd>
              </div>
              <div>
                <dt className="text-xs text-gray-500">Expires</dt>
                <dd className={`mt-1 font-bold ${quoteExpired ? "text-red-300" : "text-white"}`}>
                  {quoteExpired ? "Expired" : `${quoteSeconds}s`}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-gray-500">Payment rail</dt>
                <dd className="mt-1 font-bold text-white">x402 exact · {network.label}</dd>
              </div>
              <div className="rounded-xl border border-amber-400/20 bg-amber-400/[0.05] p-3 text-xs leading-5 text-amber-100">
                Your wallet shows a typed-data signature, not a normal gas
                transaction. Signing authorizes this exact USDC amount for this
                quote only; the facilitator may settle it on Mainnet.
              </div>
            </dl>
          ) : (
            <p className="mt-4 text-sm leading-6 text-gray-400">
              No authorization is requested until Predarc validates the live
              provider quote, {network.shortLabel} USDC asset, recipient, expiry and your caps.
            </p>
          )}
        </aside>
      </div>

      {currentReceipt ? (
        <div className="mt-6 rounded-2xl border border-emerald-400/20 bg-emerald-400/[0.04] p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.14em] text-emerald-300">
                Paid AI receipt verified
              </p>
              <h3 className="mt-2 text-xl font-black">
                {currentReceipt.market} · {DURATION_LABELS[currentReceipt.durationSeconds]}
              </h3>
            </div>
            <span className={`rounded-full border px-3 py-1 text-xs font-black uppercase ${signalClasses(currentReceipt.signal)}`}>
              {currentReceipt.signal} · {currentReceipt.confidence}%
            </span>
          </div>
          <p className="mt-4 text-sm leading-6 text-gray-300">{currentReceipt.rationale}</p>
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <span className="text-sm font-black text-white">
              Cost: {formatResearchUsdc(currentReceipt.spending.actualCostAtomic)} USDC
            </span>
            <Link
              href={`/research/receipts/${currentReceipt.id}`}
              className="rounded-xl bg-orange-500 px-4 py-2 text-xs font-black text-white"
            >
              Open public receipt
            </Link>
          </div>
        </div>
      ) : null}

      <div className="mt-6 border-t border-white/10 pt-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm font-black text-white">Latest paid receipts</p>
          <button
            type="button"
            disabled={!isSignedIn || isLoading}
            onClick={() => void loadHistory()}
            className="rounded-xl border border-white/10 px-4 py-2 text-xs font-bold text-gray-300 disabled:opacity-45"
          >
            {isLoading ? "Refreshing…" : "Refresh"}
          </button>
        </div>
        {receipts.length ? (
          <div className="mt-4 grid gap-3 md:grid-cols-2">
            {receipts.slice(0, 4).map((receipt) => (
              <article key={receipt.id} className="rounded-2xl border border-white/10 bg-black/20 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-black text-white">{receipt.market} · {DURATION_LABELS[receipt.durationSeconds]}</p>
                    <p className="mt-1 text-xs text-gray-500">{shortDate(receipt.createdAt)}</p>
                  </div>
                  <span className="text-xs font-black text-emerald-300">
                    {formatResearchUsdc(receipt.spending.actualCostAtomic)} USDC
                  </span>
                </div>
                <Link
                  href={`/research/receipts/${receipt.id}`}
                  className="mt-3 inline-flex text-xs font-black text-orange-300 hover:text-white"
                >
                  Verify receipt →
                </Link>
              </article>
            ))}
          </div>
        ) : (
          <p className="mt-4 text-sm text-gray-500">No paid AI receipts yet.</p>
        )}
      </div>

      {message ? (
        <p
          role="status"
          aria-live="polite"
          className={`mt-5 rounded-2xl border p-4 text-sm ${
            messageTone === "success"
              ? "border-emerald-400/25 bg-emerald-400/[0.06] text-emerald-200"
              : messageTone === "error"
                ? "border-red-400/25 bg-red-400/[0.06] text-red-200"
                : "border-blue-400/25 bg-blue-400/[0.06] text-blue-200"
          }`}
        >
          {message}
        </p>
      ) : null}
    </section>
  );
}
