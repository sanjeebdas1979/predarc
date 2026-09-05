"use client";

import {
  useEffect,
  useMemo,
  useState,
} from "react";
import {
  usePublicClient,
  useWriteContract,
} from "wagmi";
import { arcTestnet } from "viem/chains";

import {
  FORECAST_REGISTRY_V2_ABI,
  FORECAST_REGISTRY_V2_ADDRESS,
} from "../../contracts/forecastRegistryV2";

import { useBtcPrice } from "../providers/BtcPriceProvider";
import { useDemoPoints } from "../providers/DemoPointsProvider";

import {
  useRound,
  type PredictionDuration,
} from "../providers/RoundProvider";

function getPriceDecimals(
  market: string
): number {
  return market === "XRP"
    ? 4
    : 2;
}

function formatPrice(
  price: number | null,
  market: string
): string {
  if (
    price === null ||
    !Number.isFinite(price)
  ) {
    return "Waiting...";
  }

  const decimals =
    getPriceDecimals(
      market
    );

  return `${price.toLocaleString(undefined, {
    minimumFractionDigits:
      decimals,
    maximumFractionDigits:
      decimals,
  })}`;
}

function formatDifference(
  difference: number | null,
  market: string
): string {
  if (
    difference === null ||
    !Number.isFinite(
      difference
    )
  ) {
    return "Waiting...";
  }

  const sign =
    difference >= 0
      ? "+"
      : "-";

  const decimals =
    getPriceDecimals(
      market
    );

  return `${sign}${Math.abs(
    difference
  ).toLocaleString(undefined, {
    minimumFractionDigits:
      decimals,
    maximumFractionDigits:
      decimals,
  })}`;
}

function formatDuration(
  duration: PredictionDuration | null
): string {
  if (duration === 60) {
    return "1 Minute";
  }

  if (duration === 300) {
    return "5 Minutes";
  }

  if (duration === 900) {
    return "15 Minutes";
  }

  return "Not recorded";
}

function formatTime(seconds: number): string {
  const safeSeconds = Math.max(0, seconds);
  const minutes = Math.floor(safeSeconds / 60);
  const remainingSeconds = safeSeconds % 60;

  return `${minutes
    .toString()
    .padStart(2, "0")}:${remainingSeconds
    .toString()
    .padStart(2, "0")}`;
}

function shortenHash(hash: string): string {
  return `${hash.slice(0, 10)}...${hash.slice(-8)}`;
}

function getTransactionError(
  error: unknown
): string {
  if (!(error instanceof Error)) {
    return "Onchain transaction failed.";
  }

  const message = error.message.toLowerCase();

  if (
    message.includes("user rejected") ||
    message.includes("user denied")
  ) {
    return "Transaction was rejected in MetaMask.";
  }

  if (message.includes("only owner")) {
    return "Only the ForecastRegistryV2 owner wallet can resolve this forecast.";
  }

  if (
    message.includes("already resolved")
  ) {
    return "This forecast has already been resolved onchain.";
  }

  if (
    message.includes("already claimed")
  ) {
    return "This reward has already been claimed.";
  }

  if (
    message.includes("did not win") ||
    message.includes("no claimable reward")
  ) {
    return "No onchain reward is available for this forecast.";
  }

  return "Onchain transaction failed. Please try again.";
}

export default function ActivePredictionCard() {
  const {
    predictions,
    setResolveTransaction,
    claimRewardLocally,
  } = useDemoPoints();

  const { data } = useBtcPrice();

  const {
    roundNumber,
    timeLeft,
    status,
    result,
    startPrice,
    endPrice,
    roundMarket,
    roundDuration,
  } = useRound();

  const publicClient = usePublicClient({
    chainId: arcTestnet.id,
  });

  const {
    writeContractAsync,
    isPending: isWaitingForWallet,
  } = useWriteContract();

  const [transactionMessage, setTransactionMessage] =
    useState("");

  const [
    isConfirmingTransaction,
    setIsConfirmingTransaction,
  ] = useState(false);

  const [latestTransactionHash, setLatestTransactionHash] =
    useState<`0x${string}` | null>(null);

  const [isResolvedOnchain, setIsResolvedOnchain] =
    useState(false);

  const currentPrediction = useMemo(
    () =>
      predictions.find(
        (prediction) =>
          prediction.roundNumber === roundNumber &&
          prediction.market === roundMarket &&
          prediction.duration === roundDuration &&
          prediction.status === "pending"
      ) ?? null,
    [
      predictions,
      roundNumber,
      roundMarket,
      roundDuration,
    ]
  );

  useEffect(() => {
    setIsResolvedOnchain(
      Boolean(
        currentPrediction?.resolveTransactionHash
      )
    );

    setTransactionMessage("");
    setLatestTransactionHash(null);
  }, [
    currentPrediction?.id,
    currentPrediction?.resolveTransactionHash,
  ]);

  if (!currentPrediction) {
    return (
      <section className="rounded-3xl border border-white/10 bg-[#0d121a] p-5">
        <p className="text-xs font-semibold text-orange-400">
          Live Position
        </p>

        <h2 className="mt-2 text-xl font-bold text-white">
          No active prediction
        </h2>

        <div className="mt-4 rounded-2xl border border-dashed border-white/10 bg-white/[0.02] p-5 text-center">
          <p className="text-xs leading-5 text-gray-400">
            Submit a Higher or Lower prediction to track
            your position here.
          </p>
        </div>
      </section>
    );
  }
   const activePrediction = currentPrediction;
  const livePrice =
    data && Number.isFinite(data.price)
      ? data.price
      : null;

  const entryPrice =
    currentPrediction.startPrice ?? startPrice;

  const finalPrice =
    currentPrediction.endPrice ?? endPrice;

  const displayPrice =
    currentPrediction.status === "pending"
      ? livePrice
      : finalPrice;

  const priceDifference =
    entryPrice !== null && displayPrice !== null
      ? displayPrice - entryPrice
      : null;

  const isDirectionCurrentlyCorrect =
    priceDifference === null
      ? null
      : currentPrediction.direction === "higher"
        ? priceDifference > 0
        : priceDifference < 0;

  const isSettled =
    currentPrediction.status !== "pending";

  const isWinner =
    currentPrediction.status === "won";

  const isClaimed =
    currentPrediction.claimed;

  const forecastId =
    currentPrediction.forecastId;

  const isOnchainBusy =
    isWaitingForWallet ||
    isConfirmingTransaction;

  const statusText =
    currentPrediction.status === "won"
      ? isClaimed
        ? "CLAIMED"
        : "WON"
      : currentPrediction.status === "lost"
        ? "LOST"
        : status === "resolving"
          ? "RESOLVING"
          : "LIVE";

  const statusStyles =
    currentPrediction.status === "won"
      ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-400"
      : currentPrediction.status === "lost"
        ? "border-rose-500/30 bg-rose-500/10 text-rose-400"
        : status === "resolving"
          ? "border-yellow-500/30 bg-yellow-500/10 text-yellow-400"
          : "border-blue-500/30 bg-blue-500/10 text-blue-400";

  const movementStyles =
    priceDifference === null
      ? "text-gray-300"
      : priceDifference >= 0
        ? "text-emerald-400"
        : "text-rose-400";

  async function resolveRewardOnchain(): Promise<void> {
    if (!forecastId) {
      setTransactionMessage(
        "This prediction does not have an onchain forecast ID."
      );
      return;
    }

    if (
      finalPrice === null ||
      !Number.isFinite(finalPrice) ||
      finalPrice <= 0
    ) {
      setTransactionMessage(
        "Final BTC price is not ready yet."
      );
      return;
    }

    if (!publicClient) {
      setTransactionMessage(
        "Arc Testnet client is not ready."
      );
      return;
    }

    try {
      setTransactionMessage(
        "Confirm forecast resolution in MetaMask."
      );

      setLatestTransactionHash(null);

      const scaledFinalPrice = BigInt(
        Math.round(finalPrice * 100)
      );

      const hash = await writeContractAsync({
        address:
          FORECAST_REGISTRY_V2_ADDRESS,
        abi: FORECAST_REGISTRY_V2_ABI,
        functionName: "resolveForecast",
        args: [
          BigInt(forecastId),
          scaledFinalPrice,
        ],
        chainId: arcTestnet.id,
      });

      setLatestTransactionHash(hash);
      setIsConfirmingTransaction(true);

      setTransactionMessage(
        "Waiting for Arc Testnet resolution confirmation..."
      );

      const receipt =
        await publicClient.waitForTransactionReceipt({
          hash,
          confirmations: 1,
        });

      if (receipt.status !== "success") {
        throw new Error(
          "Resolution transaction failed."
        );
      }

      setResolveTransaction(
  activePrediction.id,
  hash
);

      setIsResolvedOnchain(true);

      setTransactionMessage(
        "Reward is now claimable onchain."
      );
    } catch (error) {
      console.error(
        "Onchain forecast resolution failed:",
        error
      );

      setTransactionMessage(
        getTransactionError(error)
      );
    } finally {
      setIsConfirmingTransaction(false);
    }
  }

  async function claimRewardOnchain(): Promise<void> {
    if (!forecastId) {
      setTransactionMessage(
        "This prediction does not have an onchain forecast ID."
      );
      return;
    }

    if (!publicClient) {
      setTransactionMessage(
        "Arc Testnet client is not ready."
      );
      return;
    }

    try {
      setTransactionMessage(
        "Confirm reward claim in MetaMask."
      );

      setLatestTransactionHash(null);

      const hash = await writeContractAsync({
        address:
          FORECAST_REGISTRY_V2_ADDRESS,
        abi: FORECAST_REGISTRY_V2_ABI,
        functionName: "claimReward",
        args: [BigInt(forecastId)],
        chainId: arcTestnet.id,
      });

      setLatestTransactionHash(hash);
      setIsConfirmingTransaction(true);

      setTransactionMessage(
        "Waiting for Arc Testnet claim confirmation..."
      );

      const receipt =
        await publicClient.waitForTransactionReceipt({
          hash,
          confirmations: 1,
        });

      if (receipt.status !== "success") {
        throw new Error(
          "Claim transaction failed."
        );
      }

      const didUpdateBalance =
        claimRewardLocally(
          activePrediction.id,
          hash
        );

      if (!didUpdateBalance) {
        setTransactionMessage(
          "Claim confirmed, but local Arena balance could not be updated."
        );
        return;
      }

      setTransactionMessage(
        "Arena Points claimed successfully."
      );
    } catch (error) {
      console.error(
        "Onchain reward claim failed:",
        error
      );

      setTransactionMessage(
        getTransactionError(error)
      );
    } finally {
      setIsConfirmingTransaction(false);
    }
  }

  return (
    <section className="rounded-2xl border border-white/10 bg-[#0d121a] p-4">
      {/* Compact header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2.5">
          <p className="text-[10px] font-black uppercase tracking-[0.16em] text-orange-400">
            {isSettled
              ? "Prediction Settled"
              : "Your Active Prediction"}
          </p>

          <span className="text-base font-bold text-white">
            Round #{currentPrediction.roundNumber}
          </span>

          <span
            className={`rounded-full border px-2.5 py-1 text-[9px] font-black ${
              currentPrediction.direction === "higher"
                ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-400"
                : "border-rose-500/30 bg-rose-500/10 text-rose-400"
            }`}
          >
            {currentPrediction.direction === "higher"
              ? "↑ HIGHER"
              : "↓ LOWER"}
          </span>
        </div>

        <span
          className={`rounded-full border px-2.5 py-1 text-[9px] font-bold ${statusStyles}`}
        >
          {statusText}
        </span>
      </div>

      {/* Compact prediction data */}
      <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-6">
        <div className="rounded-xl border border-white/10 bg-white/[0.025] px-3 py-2.5">
          <p className="text-[9px] uppercase tracking-wide text-gray-500">
            Timeframe
          </p>

          <p className="mt-1 text-sm font-semibold text-white">
            {formatDuration(
              currentPrediction.duration
            )}
          </p>
        </div>

        <div className="rounded-xl border border-white/10 bg-white/[0.025] px-3 py-2.5">
          <p className="text-[9px] uppercase tracking-wide text-gray-500">
            Stake
          </p>

          <p className="mt-1 text-sm font-semibold text-white">
            {currentPrediction.points.toLocaleString()} pts
          </p>
        </div>

        <div className="rounded-xl border border-white/10 bg-white/[0.025] px-3 py-2.5">
          <p className="text-[9px] uppercase tracking-wide text-gray-500">
            Entry
          </p>

          <p className="mt-1 font-mono text-xs font-bold text-white">
            {formatPrice(
              entryPrice,
              currentPrediction.market
            )}
          </p>
        </div>

        <div className="rounded-xl border border-white/10 bg-white/[0.025] px-3 py-2.5">
          <p className="text-[9px] uppercase tracking-wide text-gray-500">
            {isSettled
              ? "Final"
              : "Live"}
          </p>

          <p className="mt-1 font-mono text-xs font-bold text-white">
            {formatPrice(
              displayPrice,
              currentPrediction.market
            )}
          </p>
        </div>

        <div className="rounded-xl border border-white/10 bg-white/[0.025] px-3 py-2.5">
          <p className="text-[9px] uppercase tracking-wide text-gray-500">
            Movement
          </p>

          <p
            className={`mt-1 font-mono text-xs font-black ${movementStyles}`}
          >
            {formatDifference(
              priceDifference,
              currentPrediction.market
            )}
          </p>
        </div>

        <div className="rounded-xl border border-white/10 bg-white/[0.025] px-3 py-2.5">
          <p className="text-[9px] uppercase tracking-wide text-gray-500">
            {isSettled
              ? "Result"
              : "Position"}
          </p>

          <p
            className={`mt-1 text-xs font-black ${
              isSettled
                ? isWinner
                  ? "text-emerald-400"
                  : "text-rose-400"
                : isDirectionCurrentlyCorrect === null
                  ? "text-gray-300"
                  : isDirectionCurrentlyCorrect
                    ? "text-emerald-400"
                    : "text-rose-400"
            }`}
          >
            {isSettled
              ? isWinner
                ? "WIN"
                : "LOSS"
              : isDirectionCurrentlyCorrect === null
                ? "WAITING"
                : isDirectionCurrentlyCorrect
                  ? "WINNING"
                  : "LOSING"}
          </p>
        </div>
      </div>

      {/* Compact reward controls only after a win */}
      {isWinner && (
        <div className="mt-3 rounded-xl border border-emerald-500/25 bg-emerald-500/[0.06] p-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-[9px] font-semibold uppercase tracking-wide text-emerald-400">
                Arena Reward
              </p>

              <p className="mt-0.5 text-base font-black text-white">
                +{currentPrediction.reward.toLocaleString()} points
              </p>
            </div>

            <span
              className={`rounded-full border px-2.5 py-1 text-[9px] font-bold ${
                isClaimed
                  ? "border-blue-500/30 bg-blue-500/10 text-blue-300"
                  : isResolvedOnchain
                    ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-400"
                    : "border-yellow-500/30 bg-yellow-500/10 text-yellow-400"
              }`}
            >
              {isClaimed
                ? "CLAIMED"
                : isResolvedOnchain
                  ? "CLAIMABLE"
                  : "AWAITING RESOLUTION"}
            </span>
          </div>

          {!isClaimed && !isResolvedOnchain && (
            <button
              type="button"
              onClick={() => {
                void resolveRewardOnchain();
              }}
              disabled={isOnchainBusy}
              className="mt-2.5 w-full rounded-lg border border-yellow-500/30 bg-yellow-500/10 px-3 py-2 text-[10px] font-bold text-yellow-300 transition hover:bg-yellow-500/20 disabled:cursor-wait disabled:opacity-50"
            >
              {isOnchainBusy
                ? "PROCESSING ON ARC..."
                : "RESOLVE REWARD ONCHAIN"}
            </button>
          )}

          {!isClaimed && isResolvedOnchain && (
            <button
              type="button"
              onClick={() => {
                void claimRewardOnchain();
              }}
              disabled={isOnchainBusy}
              className="mt-2.5 w-full rounded-lg border border-emerald-400/40 bg-emerald-500 px-3 py-2 text-[10px] font-black text-[#07120d] transition hover:bg-emerald-400 disabled:cursor-wait disabled:opacity-50"
            >
              {isOnchainBusy
                ? "PROCESSING CLAIM..."
                : `CLAIM ${currentPrediction.reward.toLocaleString()} ARENA POINTS`}
            </button>
          )}
        </div>
      )}

      {/* Transaction feedback */}
      {transactionMessage && (
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-blue-500/20 bg-blue-500/[0.06] px-3 py-2">
          <p className="text-[9px] font-semibold text-blue-200">
            {transactionMessage}
          </p>

          {latestTransactionHash && (
            <a
              href={`https://testnet.arcscan.app/tx/${latestTransactionHash}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-[9px] font-semibold text-blue-300 hover:text-blue-200"
            >
              View on Arc Explorer
            </a>
          )}
        </div>
      )}
    </section>
  );
}