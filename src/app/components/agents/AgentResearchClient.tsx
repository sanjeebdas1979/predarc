"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  useAccount,
  useConnect,
  useDisconnect,
  useSwitchChain,
} from "wagmi";

import PredarcSessionCard from "@/app/components/auth/PredarcSessionCard";
import PredarcBrand from "@/app/components/brand/PredarcBrand";
import PaidAgentResearchPanel from "@/app/components/agents/PaidAgentResearchPanel";
import { usePredarcSession } from "@/app/components/providers/PredarcSessionProvider";
import {
  AGENT_RESEARCH_BUDGETS,
  AGENT_RESEARCH_DAILY_LIMIT,
  AGENT_RESEARCH_DURATIONS,
  AGENT_RESEARCH_MARKETS,
  formatResearchUsdc,
  parseAgentResearchReceipt,
  parseAgentResearchResponse,
  type AgentResearchDuration,
  type AgentResearchMarket,
  type AgentResearchReceipt,
} from "@/lib/agent-research-core";
import { forecastChainId, forecastNetworkLabel } from "@/lib/forecast-network";

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

function parseHistory(value: unknown): {
  receipts: AgentResearchReceipt[];
  runsLast24Hours: number;
  dailyLimit: number;
} | null {
  if (!isRecord(value) || !Array.isArray(value.receipts) || !isRecord(value.usage)) {
    return null;
  }

  const receipts = value.receipts.map(parseAgentResearchReceipt);
  const runsLast24Hours = value.usage.runsLast24Hours;
  const dailyLimit = value.usage.dailyLimit;

  if (
    receipts.some((receipt) => !receipt) ||
    typeof runsLast24Hours !== "number" ||
    !Number.isSafeInteger(runsLast24Hours) ||
    typeof dailyLimit !== "number" ||
    !Number.isSafeInteger(dailyLimit)
  ) {
    return null;
  }

  return {
    receipts: receipts as AgentResearchReceipt[],
    runsLast24Hours,
    dailyLimit,
  };
}

function shortWallet(value: string): string {
  return `${value.slice(0, 6)}...${value.slice(-4)}`;
}

function shortHash(value: string): string {
  return `${value.slice(0, 12)}…${value.slice(-10)}`;
}

function shortDate(value: string): string {
  return new Intl.DateTimeFormat("en", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function formatPrice(value: string): string {
  const number = Number(value);
  if (!Number.isFinite(number)) return value;

  return new Intl.NumberFormat("en-US", {
    maximumFractionDigits: number >= 1_000 ? 2 : number >= 1 ? 4 : 6,
  }).format(number);
}

function signedMetric(value: number): string {
  return `${value >= 0 ? "+" : ""}${value} bps`;
}

function signalClasses(signal: AgentResearchReceipt["signal"]): string {
  if (signal === "higher") {
    return "border-emerald-400/30 bg-emerald-400/10 text-emerald-200";
  }
  if (signal === "lower") {
    return "border-red-400/30 bg-red-400/10 text-red-200";
  }
  return "border-amber-400/30 bg-amber-400/10 text-amber-200";
}

export default function AgentResearchClient() {
  const { session, isSignedIn } = usePredarcSession();
  const { address, chainId, isConnected } = useAccount();
  const { connect, connectors, isPending: isConnecting } = useConnect();
  const { disconnect } = useDisconnect();
  const { switchChain, isPending: isSwitching } = useSwitchChain();
  const [market, setMarket] = useState<AgentResearchMarket>("BTC");
  const [durationSeconds, setDurationSeconds] =
    useState<AgentResearchDuration>(300);
  const [maxCostAtomic, setMaxCostAtomic] = useState("10000");
  const [receipts, setReceipts] = useState<AgentResearchReceipt[]>([]);
  const [currentReceipt, setCurrentReceipt] =
    useState<AgentResearchReceipt | null>(null);
  const [runsLast24Hours, setRunsLast24Hours] = useState(0);
  const [dailyLimit, setDailyLimit] = useState(AGENT_RESEARCH_DAILY_LIMIT);
  const [isLoading, setIsLoading] = useState(false);
  const [isRunning, setIsRunning] = useState(false);
  const [message, setMessage] = useState("");
  const [messageTone, setMessageTone] = useState<MessageTone>("info");
  const pendingRequestId = useRef("");
  const walletConnector =
    connectors.find((connector) =>
      connector.name.toLowerCase().includes("metamask")
    ) ?? connectors[0];

  const loadHistory = useCallback(async () => {
    if (!isSignedIn) {
      setReceipts([]);
      setCurrentReceipt(null);
      setRunsLast24Hours(0);
      return;
    }

    setIsLoading(true);
    try {
      const response = await fetch("/api/agents/research", {
        credentials: "same-origin",
        cache: "no-store",
      });
      const result = await readJson(response);

      if (!response.ok) {
        throw new Error(responseError(result, "Unable to load research history."));
      }

      const parsed = parseHistory(result);
      if (!parsed) throw new Error("Predarc returned an unexpected response.");

      setReceipts(parsed.receipts);
      setRunsLast24Hours(parsed.runsLast24Hours);
      setDailyLimit(parsed.dailyLimit);
    } catch (error) {
      setMessageTone("error");
      setMessage(
        error instanceof Error
          ? error.message
          : "Unable to load research history."
      );
    } finally {
      setIsLoading(false);
    }
  }, [isSignedIn]);

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      void loadHistory();
    }, 0);

    return () => window.clearTimeout(timeout);
  }, [loadHistory]);

  async function runResearch() {
    setMessage("");

    if (!isSignedIn || !session) {
      setMessageTone("error");
      setMessage("Connect your wallet and sign in to Predarc first.");
      return;
    }

    setIsRunning(true);
    try {
      const requestId = pendingRequestId.current || crypto.randomUUID();
      pendingRequestId.current = requestId;
      const response = await fetch("/api/agents/research", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          requestId,
          market,
          durationSeconds,
          maxCostAtomic,
        }),
      });
      const result = await readJson(response);

      if (!response.ok) {
        throw new Error(responseError(result, "Unable to run market research."));
      }

      const parsed = parseAgentResearchResponse(result);
      if (!parsed) throw new Error("Predarc returned an unexpected receipt.");

      setCurrentReceipt(parsed.receipt);
      pendingRequestId.current = "";
      setReceipts((current) => [
        parsed.receipt,
        ...current.filter((receipt) => receipt.id !== parsed.receipt.id),
      ]);
      setRunsLast24Hours((current) =>
        parsed.replayed ? current : Math.min(dailyLimit, current + 1)
      );
      setMessageTone("success");
      setMessage(
        parsed.replayed
          ? "The original verified receipt was returned safely."
          : "Research complete. Its SHA-256 receipt passed verification."
      );
    } catch (error) {
      setMessageTone("error");
      setMessage(
        error instanceof Error
          ? error.message
          : "Unable to run market research."
      );
    } finally {
      setIsRunning(false);
    }
  }

  async function copyReceipt(receipt: AgentResearchReceipt) {
    try {
      await navigator.clipboard.writeText(JSON.stringify(receipt, null, 2));
      setMessageTone("success");
      setMessage("Verified research receipt copied.");
    } catch {
      setMessageTone("error");
      setMessage("Copy failed. Open the receipt and copy it manually.");
    }
  }

  const usagePercent = Math.min(
    100,
    dailyLimit > 0 ? (runsLast24Hours / dailyLimit) * 100 : 0
  );

  return (
    <main className="min-h-screen bg-[#070b12] text-white">
      <header className="border-b border-white/10 bg-[#0b1017]/95 backdrop-blur">
        <div className="mx-auto flex max-w-[1400px] flex-wrap items-center justify-between gap-4 px-4 py-4 sm:px-6">
          <PredarcBrand />
          <nav className="flex flex-wrap items-center gap-4 text-sm font-bold text-orange-300">
            <Link href="/arena" className="hover:text-white">Arena</Link>
            <Link href="/markets" className="hover:text-white">Markets</Link>
            <Link href="/agents" className="hover:text-white">AI Agents</Link>
            <Link href="/guide" className="hover:text-white">Guide</Link>
          </nav>
          {!isConnected ? (
            <button
              type="button"
              disabled={!walletConnector || isConnecting}
              onClick={() =>
                walletConnector && connect({ connector: walletConnector })
              }
              className="rounded-xl bg-orange-500 px-5 py-2.5 text-sm font-bold text-white transition hover:bg-orange-400 disabled:opacity-50"
            >
              {isConnecting ? "Connecting…" : "Connect wallet"}
            </button>
          ) : chainId !== forecastChainId ? (
            <button
              type="button"
              disabled={isSwitching}
              onClick={() => switchChain({ chainId: forecastChainId })}
              className="rounded-xl bg-amber-300 px-5 py-2.5 text-sm font-bold text-black disabled:opacity-50"
            >
              {isSwitching ? "Switching…" : `Switch to ${forecastNetworkLabel}`}
            </button>
          ) : (
            <div className="flex items-center gap-2">
              <span className="rounded-xl border border-emerald-400/25 bg-emerald-400/[0.07] px-3 py-2 text-xs font-bold text-emerald-300">
                {address ? shortWallet(address) : "Connected"}
              </span>
              <button
                type="button"
                onClick={() => disconnect()}
                className="rounded-xl border border-white/10 px-3 py-2 text-xs font-bold text-gray-300 hover:text-white"
              >
                Disconnect
              </button>
            </div>
          )}
        </div>
      </header>

      <div className="mx-auto max-w-[1400px] px-4 py-10 sm:px-6">
        <section className="overflow-hidden rounded-[2rem] border border-cyan-400/20 bg-[radial-gradient(circle_at_top_right,rgba(34,211,238,0.17),transparent_42%),linear-gradient(135deg,#101725,#0b1018)] p-6 sm:p-10">
          <div className="flex flex-wrap items-center gap-3">
            <p className="text-xs font-black uppercase tracking-[0.2em] text-cyan-300">
              Predarc Agent Research
            </p>
            <span className="rounded-full border border-amber-400/25 bg-amber-400/[0.08] px-3 py-1 text-[10px] font-black uppercase tracking-[0.14em] text-amber-200">
              Preview + paid AI
            </span>
          </div>
          <h1 className="mt-4 max-w-4xl text-4xl font-black leading-tight sm:text-6xl">
            AI market intelligence with verifiable receipts.
          </h1>
          <p className="mt-5 max-w-3xl text-base leading-7 text-gray-300 sm:text-lg">
            Choose a free deterministic Preview or an opt-in paid AI call on
            Arc Mainnet. Both paths bind evidence, result and spending details
            into a SHA-256 receipt that Predarc can verify independently.
          </p>
          <div className="mt-7 grid gap-3 text-sm text-gray-300 sm:grid-cols-2 lg:grid-cols-4">
            {[
              "Finalized one-minute evidence",
              "Free Preview remains available",
              "Connected-wallet Mainnet payment",
              "Manual prediction flow unchanged",
            ].map((item) => (
              <div
                key={item}
                className="rounded-2xl border border-white/10 bg-black/20 px-4 py-3"
              >
                <span className="mr-2 text-emerald-300">✓</span>
                {item}
              </div>
            ))}
          </div>
        </section>

        <div className="mt-6">
          <PredarcSessionCard feature="Agent Research" />
        </div>

        <PaidAgentResearchPanel />

        <div className="mt-6 grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(360px,0.72fr)]">
          <section className="rounded-3xl border border-white/10 bg-[#0d121a] p-5 sm:p-7">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-xs font-black uppercase tracking-[0.18em] text-cyan-300">
                  Free Preview
                </p>
                <h2 className="mt-2 text-2xl font-black">
                  Set the research boundary
                </h2>
              </div>
              <span className="rounded-full border border-emerald-400/20 bg-emerald-400/[0.07] px-3 py-1 text-xs font-bold text-emerald-300">
                {runsLast24Hours}/{dailyLimit} runs · 24h
              </span>
            </div>

            <div className="mt-5 h-1.5 overflow-hidden rounded-full bg-white/[0.06]">
              <div
                className="h-full rounded-full bg-gradient-to-r from-cyan-400 to-violet-400 transition-[width]"
                style={{ width: `${usagePercent}%` }}
              />
            </div>

            <fieldset className="mt-7">
              <legend className="text-sm font-bold text-gray-200">Market</legend>
              <div className="mt-2 flex flex-wrap gap-2">
                {AGENT_RESEARCH_MARKETS.map((option) => (
                  <button
                    key={option}
                    type="button"
                    aria-pressed={market === option}
                    onClick={() => {
                      pendingRequestId.current = "";
                      setMarket(option);
                    }}
                    className={`rounded-full border px-4 py-2 text-xs font-black transition ${
                      market === option
                        ? "border-cyan-400/50 bg-cyan-400/15 text-cyan-100"
                        : "border-white/10 bg-white/[0.03] text-gray-400 hover:text-white"
                    }`}
                  >
                    {option}
                  </button>
                ))}
              </div>
            </fieldset>

            <fieldset className="mt-6">
              <legend className="text-sm font-bold text-gray-200">
                Forecast horizon
              </legend>
              <div className="mt-2 flex flex-wrap gap-2">
                {AGENT_RESEARCH_DURATIONS.map((option) => (
                  <button
                    key={option}
                    type="button"
                    aria-pressed={durationSeconds === option}
                    onClick={() => {
                      pendingRequestId.current = "";
                      setDurationSeconds(option);
                    }}
                    className={`rounded-full border px-4 py-2 text-xs font-black transition ${
                      durationSeconds === option
                        ? "border-violet-400/50 bg-violet-400/15 text-violet-100"
                        : "border-white/10 bg-white/[0.03] text-gray-400 hover:text-white"
                    }`}
                  >
                    {DURATION_LABELS[option]}
                  </button>
                ))}
              </div>
            </fieldset>

            <label className="mt-6 block">
              <span className="text-sm font-bold text-gray-200">
                Budget boundary recorded in receipt
              </span>
              <select
                value={maxCostAtomic}
                onChange={(event) => {
                  pendingRequestId.current = "";
                  setMaxCostAtomic(event.target.value);
                }}
                className="mt-2 w-full rounded-xl border border-white/10 bg-[#080c12] px-4 py-3 outline-none transition focus:border-cyan-400/60"
              >
                {AGENT_RESEARCH_BUDGETS.map((budget) => (
                  <option key={budget} value={budget}>
                    {formatResearchUsdc(budget)} USDC per run
                  </option>
                ))}
              </select>
              <span className="mt-2 block text-xs leading-5 text-gray-500">
                This cap is written into the receipt. Preview currently charges
                exactly 0 USDC and makes no wallet transaction.
              </span>
            </label>

            <button
              type="button"
              disabled={
                !isSignedIn ||
                isRunning ||
                runsLast24Hours >= dailyLimit
              }
              onClick={() => void runResearch()}
              className="predarc-gradient-button mt-7 w-full disabled:cursor-not-allowed disabled:opacity-45"
            >
              {isRunning ? "Analyzing finalized evidence…" : "Run market analysis"}
            </button>
          </section>

          <aside className="space-y-6">
            <section className="rounded-3xl border border-white/10 bg-[#0d121a] p-5">
              <p className="text-xs font-black uppercase tracking-[0.16em] text-blue-300">
                What runs today
              </p>
              <h2 className="mt-2 text-xl font-black">
                Transparent Preview engine
              </h2>
              <p className="mt-3 text-sm leading-6 text-gray-300">
                A deterministic evidence engine evaluates momentum, trend,
                volatility and range position from finalized Binance candles.
                The same evidence and engine version produce an auditable result.
              </p>
            </section>

            <section className="rounded-3xl border border-white/10 bg-[#0d121a] p-5">
              <p className="text-xs font-black uppercase tracking-[0.16em] text-violet-300">
                Paid mode is separate
              </p>
              <ul className="mt-4 space-y-3 text-sm leading-6 text-gray-300">
                <li>• A live BlockRun model quote is checked before signing.</li>
                <li>• Arc Mainnet USDC uses one-time x402 exact authorization.</li>
                <li>• Per-call and rolling 24-hour caps are database-enforced.</li>
                <li>• Research never submits a prediction automatically.</li>
              </ul>
            </section>
          </aside>
        </div>

        {currentReceipt ? (
          <section className="mt-6 rounded-3xl border border-cyan-400/20 bg-[#0d121a] p-5 sm:p-7">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <p className="text-xs font-black uppercase tracking-[0.18em] text-cyan-300">
                  Verified research receipt
                </p>
                <h2 className="mt-2 text-2xl font-black">
                  {currentReceipt.market} · {DURATION_LABELS[currentReceipt.durationSeconds]}
                </h2>
              </div>
              <span className={`rounded-full border px-4 py-2 text-sm font-black uppercase ${signalClasses(currentReceipt.signal)}`}>
                {currentReceipt.signal} · {currentReceipt.confidence}%
              </span>
            </div>

            <p className="mt-5 max-w-4xl text-sm leading-7 text-gray-300">
              {currentReceipt.rationale}
            </p>

            <dl className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
              {[
                ["Entry price", `$${formatPrice(currentReceipt.evidence.entryPrice)}`],
                ["Momentum", signedMetric(currentReceipt.metrics.horizonReturnBps)],
                ["Fast trend", signedMetric(currentReceipt.metrics.fastTrendBps)],
                ["Volatility", `${currentReceipt.metrics.volatilityBps} bps`],
                ["Actual cost", "0 USDC"],
              ].map(([label, value]) => (
                <div key={label} className="rounded-2xl border border-white/[0.07] bg-black/20 p-4">
                  <dt className="text-[10px] font-black uppercase tracking-[0.14em] text-gray-500">
                    {label}
                  </dt>
                  <dd className="mt-2 text-sm font-black text-white">{value}</dd>
                </div>
              ))}
            </dl>

            <div className="mt-6 rounded-2xl border border-emerald-400/20 bg-emerald-400/[0.05] p-4">
              <p className="text-xs font-black uppercase tracking-[0.14em] text-emerald-300">
                SHA-256 integrity verified
              </p>
              <p className="mt-2 break-all font-mono text-xs leading-5 text-gray-300">
                {currentReceipt.receiptHash}
              </p>
            </div>

            <div className="mt-5 flex flex-wrap gap-3">
              <Link
                href={`/research/receipts/${currentReceipt.id}`}
                className="rounded-xl bg-orange-500 px-5 py-2.5 text-sm font-black text-white"
              >
                Open public receipt
              </Link>
              <button
                type="button"
                onClick={() => void copyReceipt(currentReceipt)}
                className="rounded-xl border border-white/15 px-5 py-2.5 text-sm font-bold text-white"
              >
                Copy receipt JSON
              </button>
              <Link
                href="/arena"
                className="rounded-xl border border-white/15 px-5 py-2.5 text-sm font-bold text-white"
              >
                Open Arena manually
              </Link>
            </div>
            <p className="mt-3 text-xs leading-5 text-gray-500">
              Opening the Arena does not submit or prefill a prediction. Research
              and execution remain separate in this phase.
            </p>
          </section>
        ) : null}

        <section className="mt-6 rounded-3xl border border-white/10 bg-[#0d121a] p-5 sm:p-7">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.18em] text-violet-300">
                Research history
              </p>
              <h2 className="mt-2 text-2xl font-black">Your latest receipts</h2>
            </div>
            <button
              type="button"
              disabled={!isSignedIn || isLoading}
              onClick={() => void loadHistory()}
              className="rounded-xl border border-white/10 px-4 py-2 text-xs font-bold text-gray-300 hover:text-white disabled:opacity-50"
            >
              {isLoading ? "Refreshing…" : "Refresh"}
            </button>
          </div>

          {receipts.length === 0 ? (
            <p className="mt-5 rounded-2xl border border-dashed border-white/10 p-5 text-sm text-gray-500">
              {isSignedIn
                ? "No research receipts yet."
                : "Sign in to view and create research receipts."}
            </p>
          ) : (
            <div className="mt-5 grid gap-4 lg:grid-cols-2">
              {receipts.map((receipt) => (
                <article
                  key={receipt.id}
                  className="rounded-2xl border border-white/10 bg-black/20 p-5"
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <h3 className="text-lg font-black">
                        {receipt.market} · {DURATION_LABELS[receipt.durationSeconds]}
                      </h3>
                      <p className="mt-1 text-xs text-gray-500">
                        {shortDate(receipt.createdAt)}
                      </p>
                    </div>
                    <span className={`rounded-full border px-3 py-1 text-xs font-black uppercase ${signalClasses(receipt.signal)}`}>
                      {receipt.signal} · {receipt.confidence}%
                    </span>
                  </div>
                  <p className="mt-4 font-mono text-xs text-gray-400">
                    {shortHash(receipt.receiptHash)}
                  </p>
                  <div className="mt-4 flex gap-2">
                    <Link
                      href={`/research/receipts/${receipt.id}`}
                      className="rounded-xl border border-white/15 px-4 py-2 text-xs font-bold text-white"
                    >
                      Verify
                    </Link>
                    <button
                      type="button"
                      onClick={() => void copyReceipt(receipt)}
                      className="rounded-xl border border-white/15 px-4 py-2 text-xs font-bold text-white"
                    >
                      Copy JSON
                    </button>
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>

        {message ? (
          <p
            role="status"
            aria-live="polite"
            className={`mt-6 rounded-2xl border p-4 text-sm ${
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
      </div>
    </main>
  );
}
