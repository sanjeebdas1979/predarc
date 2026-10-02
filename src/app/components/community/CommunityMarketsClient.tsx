"use client";

import Link from "next/link";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import {
  useAccount,
  usePublicClient,
  useSignMessage,
  useSwitchChain,
  useWriteContract,
} from "wagmi";

import PredarcBrand from "@/app/components/brand/PredarcBrand";
import PredarcSessionCard from "@/app/components/auth/PredarcSessionCard";
import { usePredarcSession } from "@/app/components/providers/PredarcSessionProvider";
import ConnectWallet from "@/app/components/wallet/ConnectWallet";
import {
  FORECAST_REGISTRY_V2_ABI,
} from "@/app/contracts/forecastRegistryV2";
import {
  COMMUNITY_MARKET_ASSETS,
  COMMUNITY_MARKET_DURATIONS,
  buildCommunityMarketCreationMessage,
  communityForecastIdFromRequestId,
  communityMarketDurationLabel,
  communityPriceToScaledBigInt,
  normalizeCommunityPrice,
  parseCommunityMarketsResponse,
  type CommunityMarket,
  type CommunityMarketAsset,
  type CommunityMarketDirection,
  type CommunityMarketDuration,
} from "@/lib/community-markets-core";
import {
  forecastChainId,
  forecastNetworkLabel,
  forecastRegistryAddress,
} from "@/lib/forecast-network";
import { pointsAsSafeNumber } from "@/lib/predarc-session-core";

const SERVER_BALANCE_EVENT = "predarc:server-balance";

type Feedback = {
  tone: "success" | "error" | "info";
  text: string;
};

type PendingPrediction = {
  requestId: string;
  direction: CommunityMarketDirection;
  points: number;
  transactionHash: `0x${string}`;
  onchainForecastId: string;
};

type Quote = {
  asset: CommunityMarketAsset;
  price: string;
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

async function requestJson(
  input: RequestInfo | URL,
  init?: RequestInit
): Promise<Record<string, unknown>> {
  const response = await fetch(input, {
    credentials: "same-origin",
    cache: "no-store",
    ...init,
  });
  const result = await readJson(response);

  if (!response.ok) {
    const message =
      isRecord(result) && typeof result.error === "string"
        ? result.error
        : "Predarc could not complete this request.";
    throw new Error(message);
  }

  if (!isRecord(result)) {
    throw new Error("Predarc returned an unexpected response.");
  }

  return result;
}

function safeMessage(error: unknown, fallback: string): string {
  return error instanceof Error && error.message.length < 240
    ? error.message
    : fallback;
}

function shortenAddress(wallet: string): string {
  return `${wallet.slice(0, 6)}…${wallet.slice(-4)}`;
}

function formatPrice(value: string): string {
  const numeric = Number(value);

  if (!Number.isFinite(numeric)) return value;

  return new Intl.NumberFormat("en-US", {
    maximumFractionDigits: numeric < 1 ? 6 : numeric < 100 ? 4 : 2,
  }).format(numeric);
}

function formatPoints(value: string): string {
  try {
    return BigInt(value).toLocaleString();
  } catch {
    return value;
  }
}

function formatCountdown(target: string, now: number): string {
  const remaining = Math.max(0, Date.parse(target) - now);
  const totalSeconds = Math.ceil(remaining / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (hours > 0) return `${hours}h ${minutes}m ${seconds}s`;
  if (minutes > 0) return `${minutes}m ${seconds}s`;
  return `${seconds}s`;
}

function targetInputValue(price: string): string {
  const numeric = Number(price);

  if (!Number.isFinite(numeric) || numeric <= 0) return "";
  if (numeric >= 1_000) return numeric.toFixed(2);
  if (numeric >= 1) return numeric.toFixed(4);
  return numeric.toFixed(6);
}

function FeedbackMessage({ feedback }: { feedback?: Feedback }) {
  if (!feedback) return null;

  const tone =
    feedback.tone === "success"
      ? "border-emerald-400/25 bg-emerald-400/[0.08] text-emerald-200"
      : feedback.tone === "error"
        ? "border-red-400/25 bg-red-400/[0.08] text-red-200"
        : "border-sky-400/25 bg-sky-400/[0.08] text-sky-100";

  return (
    <p
      role="status"
      aria-live="polite"
      className={`mt-4 rounded-xl border px-4 py-3 text-xs leading-5 ${tone}`}
    >
      {feedback.text}
    </p>
  );
}

function CommunityMarketCard({
  market,
  now,
  availablePoints,
  isSignedIn,
  busy,
  hasPendingRecord,
  feedback,
  onJoin,
  onSettle,
  onClaim,
}: {
  market: CommunityMarket;
  now: number;
  availablePoints: number;
  isSignedIn: boolean;
  busy: boolean;
  hasPendingRecord: boolean;
  feedback?: Feedback;
  onJoin: (
    market: CommunityMarket,
    direction: CommunityMarketDirection,
    points: number
  ) => Promise<void>;
  onSettle: (market: CommunityMarket) => Promise<void>;
  onClaim: (market: CommunityMarket) => Promise<void>;
}) {
  const [direction, setDirection] =
    useState<CommunityMarketDirection>("higher");
  const [points, setPoints] = useState("100");
  const closesAtMs = Date.parse(market.closesAt);
  const resolutionAtMs = Date.parse(market.resolutionAt);
  const effectiveStatus =
    market.status === "open" && closesAtMs <= now
      ? "awaiting-settlement"
      : market.status;
  const pointsValue = Number(points);
  const joinAllowed =
    effectiveStatus === "open" &&
    closesAtMs - now > 30_000 &&
    !market.userPrediction;

  return (
    <article className="rounded-3xl border border-white/10 bg-[#0d131c] p-5 shadow-[0_20px_60px_rgba(0,0,0,0.18)] sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full border border-orange-400/25 bg-orange-400/[0.08] px-3 py-1 text-[10px] font-black uppercase tracking-[0.15em] text-orange-300">
              {market.asset} / USDT
            </span>
            <span className="rounded-full border border-white/10 px-3 py-1 text-[10px] font-semibold text-gray-400">
              {communityMarketDurationLabel(market.durationSeconds)}
            </span>
          </div>
          <h2 className="mt-4 text-xl font-black leading-tight text-white sm:text-2xl">
            Will {market.asset} close above {formatPrice(market.targetPrice)} USDT?
          </h2>
          <p className="mt-2 text-xs text-gray-500">
            Created by {shortenAddress(market.creatorWallet)} · Reference {formatPrice(market.referencePrice)} USDT
          </p>
        </div>

        <div className="text-right">
          {effectiveStatus === "open" ? (
            <>
              <p className="text-[10px] font-black uppercase tracking-[0.16em] text-gray-500">
                Closes in
              </p>
              <p className="mt-1 font-mono text-sm font-bold text-orange-300">
                {formatCountdown(market.closesAt, now)}
              </p>
            </>
          ) : effectiveStatus === "awaiting-settlement" ? (
            <>
              <p className="text-[10px] font-black uppercase tracking-[0.16em] text-amber-400">
                Final price
              </p>
              <p className="mt-1 text-xs font-bold text-amber-200">
                {now < resolutionAtMs
                  ? `Ready in ${formatCountdown(market.resolutionAt, now)}`
                  : "Ready to settle"}
              </p>
            </>
          ) : (
            <>
              <p className="text-[10px] font-black uppercase tracking-[0.16em] text-emerald-400">
                Settled
              </p>
              <p className="mt-1 text-sm font-black capitalize text-emerald-200">
                {market.outcome === "void" ? "Tie · refunded" : market.outcome}
              </p>
            </>
          )}
        </div>
      </div>

      <div className="mt-5 grid grid-cols-3 gap-2">
        <div className="rounded-xl border border-emerald-400/15 bg-emerald-400/[0.05] p-3">
          <p className="text-[10px] uppercase tracking-wide text-gray-500">Higher</p>
          <p className="mt-1 text-sm font-black text-emerald-300">
            {formatPoints(market.higherPoints)} pts
          </p>
        </div>
        <div className="rounded-xl border border-red-400/15 bg-red-400/[0.05] p-3">
          <p className="text-[10px] uppercase tracking-wide text-gray-500">Lower</p>
          <p className="mt-1 text-sm font-black text-red-300">
            {formatPoints(market.lowerPoints)} pts
          </p>
        </div>
        <div className="rounded-xl border border-white/10 bg-white/[0.025] p-3">
          <p className="text-[10px] uppercase tracking-wide text-gray-500">Players</p>
          <p className="mt-1 text-sm font-black text-gray-200">
            {market.participantCount}
          </p>
        </div>
      </div>

      {market.userPrediction ? (
        <div className="mt-5 rounded-2xl border border-sky-400/20 bg-sky-400/[0.05] p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.13em] text-sky-300">
                Your prediction
              </p>
              <p className="mt-1 text-sm font-bold capitalize text-white">
                {market.userPrediction.direction} · {formatPoints(market.userPrediction.points)} points
              </p>
            </div>
            <p className="text-xs font-bold capitalize text-gray-300">
              {market.userPrediction.claimed
                ? "Result points collected"
                : market.userPrediction.status === "pending"
                  ? "Waiting for settlement"
                  : market.userPrediction.status}
            </p>
          </div>
          {market.userPrediction.canClaim ? (
            <button
              type="button"
              disabled={busy || !isSignedIn}
              onClick={() => void onClaim(market)}
              className="mt-4 w-full rounded-xl bg-emerald-500 px-4 py-3 text-sm font-black text-[#06110b] transition hover:bg-emerald-400 disabled:opacity-50"
            >
              {busy ? "Collecting…" : "Collect result points"}
            </button>
          ) : null}
        </div>
      ) : joinAllowed ? (
        <div className="mt-5 rounded-2xl border border-white/10 bg-black/20 p-4">
          <div className="grid grid-cols-2 gap-2">
            {(["higher", "lower"] as const).map((option) => (
              <button
                key={option}
                type="button"
                onClick={() => setDirection(option)}
                className={`rounded-xl border px-4 py-3 text-sm font-black capitalize transition ${
                  direction === option
                    ? option === "higher"
                      ? "border-emerald-400/50 bg-emerald-400/10 text-emerald-200"
                      : "border-red-400/50 bg-red-400/10 text-red-200"
                    : "border-white/10 text-gray-400 hover:border-white/20"
                }`}
              >
                {option}
              </button>
            ))}
          </div>

          <label className="mt-4 block text-xs font-bold text-gray-300">
            Server demo points
            <input
              inputMode="numeric"
              value={points}
              onChange={(event) => setPoints(event.target.value.replace(/\D/g, ""))}
              className="mt-2 w-full rounded-xl border border-white/10 bg-[#080d14] px-4 py-3 text-sm text-white outline-none transition focus:border-orange-400/50"
              placeholder="100"
            />
          </label>
          <p className="mt-2 text-[11px] text-gray-500">
            Available: {availablePoints.toLocaleString()} · Every entry still needs an Arc wallet confirmation.
          </p>
          <button
            type="button"
            disabled={
              busy ||
              !isSignedIn ||
              !Number.isInteger(pointsValue) ||
              pointsValue < 10 ||
              pointsValue > availablePoints
            }
            onClick={() => void onJoin(market, direction, pointsValue)}
            className="predarc-gradient-button mt-4 w-full px-4 py-3 text-sm disabled:opacity-50"
          >
            {busy
              ? "Waiting…"
              : hasPendingRecord
                ? "Retry server record"
                : `Confirm ${direction} on ${forecastNetworkLabel}`}
          </button>
        </div>
      ) : effectiveStatus === "open" && closesAtMs - now <= 30_000 ? (
        <p className="mt-5 rounded-xl border border-white/10 p-3 text-xs text-gray-400">
          Entries close 30 seconds before the market ends.
        </p>
      ) : null}

      {effectiveStatus === "awaiting-settlement" && now >= resolutionAtMs ? (
        <button
          type="button"
          disabled={busy || !isSignedIn}
          onClick={() => void onSettle(market)}
          className="mt-5 w-full rounded-xl border border-amber-400/30 bg-amber-400/[0.08] px-4 py-3 text-sm font-black text-amber-200 transition hover:border-amber-300 disabled:opacity-50"
        >
          {busy ? "Checking final candle…" : "Settle from finalized Binance candle"}
        </button>
      ) : null}

      {market.status === "settled" && market.settlementPrice ? (
        <p className="mt-4 text-xs text-gray-500">
          Final 1-minute candle close: {formatPrice(market.settlementPrice)} USDT. The creator did not choose this result.
        </p>
      ) : null}

      {!isSignedIn && (joinAllowed || effectiveStatus === "awaiting-settlement") ? (
        <p className="mt-4 text-xs text-gray-500">
          Connect and sign in above to use this market.
        </p>
      ) : null}

      <FeedbackMessage feedback={feedback} />
    </article>
  );
}

export default function CommunityMarketsClient() {
  const { address, chainId } = useAccount();
  const publicClient = usePublicClient({ chainId: forecastChainId });
  const { switchChainAsync } = useSwitchChain();
  const { signMessageAsync } = useSignMessage();
  const { writeContractAsync } = useWriteContract();
  const {
    session,
    isSignedIn,
    accountBalance,
  } = usePredarcSession();

  const [markets, setMarkets] = useState<CommunityMarket[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [listError, setListError] = useState("");
  const [now, setNow] = useState(() => Date.now());
  const [asset, setAsset] = useState<CommunityMarketAsset>("BTC");
  const [duration, setDuration] =
    useState<CommunityMarketDuration>(300);
  const [targetPrice, setTargetPrice] = useState("");
  const [quote, setQuote] = useState<Quote | null>(null);
  const [quoteMessage, setQuoteMessage] = useState("");
  const [createBusy, setCreateBusy] = useState(false);
  const [createFeedback, setCreateFeedback] =
    useState<Feedback | undefined>();
  const [busyMarketId, setBusyMarketId] = useState<string | null>(null);
  const [marketFeedback, setMarketFeedback] =
    useState<Record<string, Feedback>>({});
  const [pendingPredictions, setPendingPredictions] =
    useState<Record<string, PendingPrediction>>({});
  const quoteRequest = useRef(0);

  const availablePoints = pointsAsSafeNumber(accountBalance);

  const setFeedback = useCallback((marketId: string, feedback: Feedback) => {
    setMarketFeedback((current) => ({ ...current, [marketId]: feedback }));
  }, []);

  const loadMarkets = useCallback(async () => {
    try {
      const result = await requestJson("/api/community-markets");
      const parsed = parseCommunityMarketsResponse(result);

      if (!parsed) throw new Error("Predarc returned an invalid market list.");

      setMarkets(parsed);
      setListError("");
    } catch (error) {
      setListError(safeMessage(error, "Community markets could not be loaded."));
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    const initial = window.setTimeout(() => void loadMarkets(), 0);
    const refresh = window.setInterval(() => void loadMarkets(), 30_000);
    const handleFocus = () => void loadMarkets();

    window.addEventListener("focus", handleFocus);

    return () => {
      window.clearTimeout(initial);
      window.clearInterval(refresh);
      window.removeEventListener("focus", handleFocus);
    };
  }, [loadMarkets, isSignedIn]);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1_000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    const requestId = ++quoteRequest.current;
    const timer = window.setTimeout(async () => {
      setQuoteMessage("Loading live price…");

      try {
        const result = await requestJson(
          `/api/community-markets/quote?asset=${asset}`
        );

        if (
          requestId !== quoteRequest.current ||
          result.asset !== asset ||
          typeof result.price !== "string" ||
          !normalizeCommunityPrice(result.price)
        ) {
          return;
        }

        setQuote({ asset, price: result.price });
        setQuoteMessage("");
      } catch (error) {
        if (requestId !== quoteRequest.current) return;
        setQuote(null);
        setQuoteMessage(safeMessage(error, "Live price is unavailable."));
      }
    }, 0);

    return () => window.clearTimeout(timer);
  }, [asset]);

  async function createMarket() {
    const normalizedTarget = normalizeCommunityPrice(targetPrice);

    if (!isSignedIn || !session || !address) {
      setCreateFeedback({ tone: "error", text: "Connect and sign in first." });
      return;
    }
    if (!normalizedTarget) {
      setCreateFeedback({ tone: "error", text: "Enter a valid target price." });
      return;
    }

    const requestId = crypto.randomUUID();
    const message = buildCommunityMarketCreationMessage({
      requestId,
      wallet: session.wallet,
      chainId: session.chainId,
      asset,
      targetPrice: normalizedTarget,
      durationSeconds: duration,
    });

    setCreateBusy(true);
    setCreateFeedback({
      tone: "info",
      text: "Approve the gas-free market creation signature in your wallet.",
    });

    try {
      const signature = await signMessageAsync({ message });

      setCreateFeedback({ tone: "info", text: "Creating your market…" });
      await requestJson("/api/community-markets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          requestId,
          asset,
          targetPrice: normalizedTarget,
          durationSeconds: duration,
          signature,
        }),
      });

      setTargetPrice("");
      setCreateFeedback({
        tone: "success",
        text: "Community market created successfully.",
      });
      await loadMarkets();
    } catch (error) {
      setCreateFeedback({
        tone: "error",
        text: safeMessage(error, "Community market creation failed."),
      });
    } finally {
      setCreateBusy(false);
    }
  }

  async function recordPrediction(
    market: CommunityMarket,
    pending: PendingPrediction
  ) {
    const result = await requestJson(
      `/api/community-markets/${market.id}/predictions`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(pending),
      }
    );

    if (typeof result.balance !== "string") {
      throw new Error("Predarc returned an invalid points balance.");
    }

    window.dispatchEvent(
      new CustomEvent(SERVER_BALANCE_EVENT, {
        detail: { balance: result.balance },
      })
    );
    setPendingPredictions((current) => {
      const next = { ...current };
      delete next[market.id];
      return next;
    });
    setFeedback(market.id, {
      tone: "success",
      text: "Prediction confirmed on Arc and recorded successfully.",
    });
    await loadMarkets();
  }

  async function joinMarket(
    market: CommunityMarket,
    direction: CommunityMarketDirection,
    points: number
  ) {
    if (!isSignedIn || !session || !address) {
      setFeedback(market.id, { tone: "error", text: "Connect and sign in first." });
      return;
    }
    if (!Number.isInteger(points) || points < 10 || points > availablePoints) {
      setFeedback(market.id, { tone: "error", text: "Enter an available points amount of at least 10." });
      return;
    }

    const pending = pendingPredictions[market.id];
    setBusyMarketId(market.id);

    try {
      if (pending) {
        setFeedback(market.id, {
          tone: "info",
          text: "Retrying the server record for your confirmed Arc transaction…",
        });
        await recordPrediction(market, pending);
        return;
      }

      if (!publicClient) {
        throw new Error(`${forecastNetworkLabel} is not ready. Reconnect your wallet.`);
      }
      if (Date.parse(market.closesAt) - Date.now() <= 30_000) {
        throw new Error("This market is too close to expiry for a safe confirmation.");
      }
      if (chainId !== forecastChainId) {
        setFeedback(market.id, {
          tone: "info",
          text: `Switching your wallet to ${forecastNetworkLabel}…`,
        });
        await switchChainAsync({ chainId: forecastChainId });
      }

      const requestId = crypto.randomUUID();
      const forecastId = communityForecastIdFromRequestId(requestId);
      const scaledTarget = communityPriceToScaledBigInt(market.targetPrice);

      if (forecastId === null || scaledTarget === null) {
        throw new Error("This market cannot be encoded for Arc.");
      }

      setFeedback(market.id, {
        tone: "info",
        text: `Confirm the ${direction} prediction in your wallet.`,
      });
      const transactionHash = await writeContractAsync({
        address: forecastRegistryAddress,
        abi: FORECAST_REGISTRY_V2_ABI,
        functionName: "submitForecast",
        args: [
          forecastId,
          direction === "higher" ? 0 : 1,
          market.durationSeconds,
          BigInt(points),
          scaledTarget,
        ],
        chainId: forecastChainId,
      });

      setFeedback(market.id, {
        tone: "info",
        text: `Waiting for ${forecastNetworkLabel} confirmation…`,
      });
      const receipt = await publicClient.waitForTransactionReceipt({
        hash: transactionHash,
        confirmations: 1,
      });

      if (receipt.status !== "success") {
        throw new Error("The Arc prediction transaction reverted.");
      }

      const nextPending: PendingPrediction = {
        requestId,
        direction,
        points,
        transactionHash,
        onchainForecastId: forecastId.toString(),
      };
      setPendingPredictions((current) => ({
        ...current,
        [market.id]: nextPending,
      }));
      setFeedback(market.id, {
        tone: "info",
        text: "Arc confirmed. Recording the points entry on Predarc…",
      });
      await recordPrediction(market, nextPending);
    } catch (error) {
      setFeedback(market.id, {
        tone: "error",
        text: safeMessage(error, "Community prediction failed."),
      });
    } finally {
      setBusyMarketId(null);
    }
  }

  async function settleMarket(market: CommunityMarket) {
    setBusyMarketId(market.id);
    setFeedback(market.id, {
      tone: "info",
      text: "Reading the finalized Binance candle…",
    });

    try {
      await requestJson(`/api/community-markets/${market.id}/settle`, {
        method: "POST",
      });
      setFeedback(market.id, {
        tone: "success",
        text: "Market settled successfully from the finalized candle.",
      });
      await loadMarkets();
    } catch (error) {
      setFeedback(market.id, {
        tone: "error",
        text: safeMessage(error, "Community market settlement failed."),
      });
    } finally {
      setBusyMarketId(null);
    }
  }

  async function claimPrediction(market: CommunityMarket) {
    if (!market.userPrediction) return;

    setBusyMarketId(market.id);
    setFeedback(market.id, { tone: "info", text: "Collecting result points…" });

    try {
      const result = await requestJson(
        `/api/community-markets/predictions/${market.userPrediction.id}/claim`,
        { method: "POST" }
      );

      if (typeof result.balance !== "string" || typeof result.reward !== "string") {
        throw new Error("Predarc returned an invalid result balance.");
      }

      window.dispatchEvent(
        new CustomEvent(SERVER_BALANCE_EVENT, {
          detail: { balance: result.balance },
        })
      );
      setFeedback(market.id, {
        tone: "success",
        text: `${formatPoints(result.reward)} result points collected successfully.`,
      });
      await loadMarkets();
    } catch (error) {
      setFeedback(market.id, {
        tone: "error",
        text: safeMessage(error, "Result points could not be collected."),
      });
    } finally {
      setBusyMarketId(null);
    }
  }

  return (
    <main className="min-h-screen bg-[#070b11] text-white">
      <header className="border-b border-white/10 bg-[#0a0f16]/95 backdrop-blur">
        <div className="mx-auto flex max-w-[1400px] flex-wrap items-center justify-between gap-4 px-4 py-4 sm:px-6">
          <PredarcBrand />
          <nav className="flex items-center gap-4 text-sm font-bold">
            <Link href="/" className="text-gray-400 transition hover:text-white">Home</Link>
            <Link href="/arena" className="text-orange-300 transition hover:text-white">Arena</Link>
          </nav>
          <ConnectWallet />
        </div>
      </header>

      <div className="mx-auto max-w-[1400px] px-4 py-8 sm:px-6">
        <section className="grid items-start gap-6 lg:grid-cols-[minmax(0,1.25fr)_minmax(340px,0.75fr)]">
          <div className="rounded-3xl border border-white/10 bg-gradient-to-br from-orange-500/[0.09] via-[#0d131c] to-sky-500/[0.06] p-6 sm:p-8">
            <p className="text-xs font-black uppercase tracking-[0.2em] text-orange-400">
              Community Markets
            </p>
            <h1 className="mt-4 max-w-3xl text-4xl font-black leading-tight sm:text-5xl">
              Create a crypto question. Let the market answer it.
            </h1>
            <p className="mt-5 max-w-3xl text-sm leading-7 text-gray-400 sm:text-base">
              Choose a supported asset, target and fixed duration. Players confirm every prediction on Arc, while Predarc settles the result from a finalized Binance 1-minute candle. Creators cannot choose the outcome.
            </p>
            <div className="mt-6 flex flex-wrap gap-2 text-[11px] font-bold text-gray-400">
              {[
                "Crypto only",
                "5m · 15m · 1h",
                "Server demo points",
                "Deterministic settlement",
                "No cash value",
              ].map((item) => (
                <span key={item} className="rounded-full border border-white/10 bg-black/20 px-3 py-1.5">
                  {item}
                </span>
              ))}
            </div>
          </div>

          <PredarcSessionCard feature="Community markets" />
        </section>

        <section className="mt-6 rounded-3xl border border-white/10 bg-[#0d131c] p-5 sm:p-6">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.18em] text-orange-400">Create</p>
              <h2 className="mt-2 text-2xl font-black">New community market</h2>
            </div>
            <p className="max-w-md text-xs leading-5 text-gray-500">
              A gas-free wallet signature creates the question. Targets must stay within 50%–150% of the live price.
            </p>
          </div>

          <div className="mt-5 grid gap-4 md:grid-cols-[0.7fr_1.3fr_0.8fr_auto] md:items-end">
            <label className="text-xs font-bold text-gray-300">
              Asset
              <select
                value={asset}
                disabled={createBusy}
                onChange={(event) => setAsset(event.target.value as CommunityMarketAsset)}
                className="mt-2 w-full rounded-xl border border-white/10 bg-[#080d14] px-4 py-3 text-sm text-white outline-none focus:border-orange-400/50"
              >
                {COMMUNITY_MARKET_ASSETS.map((option) => (
                  <option key={option} value={option}>{option} / USDT</option>
                ))}
              </select>
            </label>

            <label className="text-xs font-bold text-gray-300">
              Target price (USDT)
              <div className="mt-2 flex rounded-xl border border-white/10 bg-[#080d14] focus-within:border-orange-400/50">
                <input
                  inputMode="decimal"
                  value={targetPrice}
                  disabled={createBusy}
                  onChange={(event) => setTargetPrice(event.target.value)}
                  className="min-w-0 flex-1 bg-transparent px-4 py-3 text-sm text-white outline-none"
                  placeholder={quote?.asset === asset ? formatPrice(quote.price) : "Enter target"}
                />
                <button
                  type="button"
                  disabled={!quote || quote.asset !== asset || createBusy}
                  onClick={() => {
                    if (quote?.asset === asset) setTargetPrice(targetInputValue(quote.price));
                  }}
                  className="border-l border-white/10 px-3 text-[10px] font-black text-sky-300 disabled:text-gray-600"
                >
                  Use live
                </button>
              </div>
              <span className="mt-1 block font-normal text-gray-500">
                {quote?.asset === asset
                  ? `Live ${asset}: ${formatPrice(quote.price)} USDT`
                  : quoteMessage || "Loading live price…"}
              </span>
            </label>

            <label className="text-xs font-bold text-gray-300">
              Duration
              <select
                value={duration}
                disabled={createBusy}
                onChange={(event) => setDuration(Number(event.target.value) as CommunityMarketDuration)}
                className="mt-2 w-full rounded-xl border border-white/10 bg-[#080d14] px-4 py-3 text-sm text-white outline-none focus:border-orange-400/50"
              >
                {COMMUNITY_MARKET_DURATIONS.map((seconds) => (
                  <option key={seconds} value={seconds}>
                    {communityMarketDurationLabel(seconds)}
                  </option>
                ))}
              </select>
            </label>

            <button
              type="button"
              disabled={createBusy || !isSignedIn || !normalizeCommunityPrice(targetPrice)}
              onClick={() => void createMarket()}
              className="predarc-gradient-button px-6 py-3 text-sm disabled:opacity-50"
            >
              {createBusy ? "Check wallet…" : "Create market"}
            </button>
          </div>
          <FeedbackMessage feedback={createFeedback} />
        </section>

        <section className="mt-8">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.18em] text-orange-400">Discover</p>
              <h2 className="mt-2 text-3xl font-black">Latest community markets</h2>
            </div>
            <button
              type="button"
              onClick={() => void loadMarkets()}
              className="rounded-xl border border-white/10 px-4 py-2 text-xs font-bold text-gray-300 transition hover:border-white/25 hover:text-white"
            >
              Refresh
            </button>
          </div>

          {listError ? (
            <p className="mt-5 rounded-xl border border-red-400/20 bg-red-400/[0.06] p-4 text-sm text-red-200">
              {listError}
            </p>
          ) : null}

          {isLoading ? (
            <p className="mt-6 text-sm text-gray-500">Loading community markets…</p>
          ) : markets.length === 0 ? (
            <div className="mt-6 rounded-3xl border border-dashed border-white/15 p-10 text-center">
              <p className="text-lg font-black">No community markets yet.</p>
              <p className="mt-2 text-sm text-gray-500">Create the first deterministic crypto market above.</p>
            </div>
          ) : (
            <div className="mt-6 grid gap-5 xl:grid-cols-2">
              {markets.map((market) => (
                <CommunityMarketCard
                  key={market.id}
                  market={market}
                  now={now}
                  availablePoints={availablePoints}
                  isSignedIn={isSignedIn}
                  busy={busyMarketId === market.id}
                  hasPendingRecord={Boolean(pendingPredictions[market.id])}
                  feedback={marketFeedback[market.id]}
                  onJoin={joinMarket}
                  onSettle={settleMarket}
                  onClaim={claimPrediction}
                />
              ))}
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
