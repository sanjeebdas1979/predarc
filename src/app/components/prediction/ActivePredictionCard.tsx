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
import {
  FORECAST_REGISTRY_V2_ABI,
} from "../../contracts/forecastRegistryV2";

import {
  forecastChainId,
  forecastExplorerBaseUrl,
  forecastNetworkLabel,
  forecastRegistryAddress,
} from "@/lib/forecast-network";
import {
  parseServerActivePrediction,
  selectActivePrediction,
  selectServerActivePrediction,
  type ServerActivePrediction,
} from "@/lib/prediction-active-core";
import { submitServerPrediction } from "@/lib/prediction-client";

import { useBtcPrice } from "../providers/BtcPriceProvider";
import {
  useDemoPoints,
  type PredictionRecord,
} from "../providers/DemoPointsProvider";
import MarketLogo from "../market/MarketLogo";

import {
  useRound,
  type PredictionDuration,
} from "../providers/RoundProvider";

const SERVER_BALANCE_EVENT =
  "predarc:server-balance";

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

  if (duration === 3600) {
    return "1 Hour";
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
    spendPoints,
    setPredictionServerSync,
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
    chainId: forecastChainId,
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

  const [isSyncingServer, setIsSyncingServer] =
    useState(false);

  const [serverActivePredictions, setServerActivePredictions] =
    useState<ServerActivePrediction[]>([]);

  useEffect(() => {
    let cancelled = false;

    async function loadServerActivePredictions(): Promise<void> {
      try {
        const response = await fetch(
          "/api/predictions",
          {
            cache: "no-store",
            credentials: "include",
          }
        );

        const result =
          await response.json();

        if (!response.ok) {
          throw new Error(
            typeof result?.error === "string"
              ? result.error
              : "Active server predictions could not be loaded."
          );
        }

        const records = Array.isArray(
          result?.predictions
        )
          ? result.predictions
          : [];

        const parsed = records.flatMap(
          (record: unknown) => {
            const prediction =
              parseServerActivePrediction(
                record
              );

            return prediction
              ? [prediction]
              : [];
          }
        );

        if (!cancelled) {
          setServerActivePredictions(
            parsed
          );
        }
      } catch (error) {
        console.error(
          "Active server prediction refresh failed:",
          error
        );
      }
    }

    function refreshServerActivePredictions() {
      void loadServerActivePredictions();
    }

    void loadServerActivePredictions();

    window.addEventListener(
      SERVER_BALANCE_EVENT,
      refreshServerActivePredictions
    );
    window.addEventListener(
      "focus",
      refreshServerActivePredictions
    );

    return () => {
      cancelled = true;
      window.removeEventListener(
        SERVER_BALANCE_EVENT,
        refreshServerActivePredictions
      );
      window.removeEventListener(
        "focus",
        refreshServerActivePredictions
      );
    };
  }, []);

  const pendingPredictions = useMemo(
    () =>
      predictions.filter(
        (prediction) =>
          prediction.status === "pending"
      ),
    [predictions]
  );

  const localPrediction = useMemo(
    () =>
      selectActivePrediction(
        predictions,
        roundMarket,
        roundDuration,
        roundNumber
      ),
    [
      predictions,
      roundNumber,
      roundMarket,
      roundDuration,
    ]
  );

  const serverPrediction = useMemo(
    () =>
      selectServerActivePrediction(
        serverActivePredictions,
        roundMarket,
        roundDuration
      ),
    [
      serverActivePredictions,
      roundMarket,
      roundDuration,
    ]
  );

  const serverBackedPrediction =
    useMemo<PredictionRecord | null>(
      () => {
        if (!serverPrediction) {
          return null;
        }

        return {
          id: -1,
          roundNumber,
          market:
            serverPrediction.market,
          direction:
            serverPrediction.direction,
          duration:
            serverPrediction.durationSeconds,
          points:
            serverPrediction.points,
          submittedAt:
            serverPrediction.acceptedAt,
          status: "pending",
          result: null,
          reward: 0,
          claimableReward: 0,
          claimed: false,
          startPrice:
            serverPrediction.entryPrice,
          endPrice: null,
          priceDifference: null,
          forecastId: null,
          transactionHash: null,
          resolveTransactionHash: null,
          claimTransactionHash: null,
          onchainStatus: "submitted",
          serverRequestId: null,
          serverSyncStatus: "synced",
        };
      },
      [
        serverPrediction,
        roundNumber,
      ]
    );

  const currentPrediction =
    localPrediction ??
    serverBackedPrediction;

  const isServerBackedPrediction =
    localPrediction === null &&
    serverBackedPrediction !== null;

  const otherActivePredictions = useMemo(
    () =>
      predictions.filter(
        (prediction) =>
          prediction.status === "pending" &&
          prediction.id !== currentPrediction?.id
      ),
    [predictions, currentPrediction?.id]
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
    currentPrediction?.market,
    currentPrediction?.resolveTransactionHash,
  ]);

  if (!currentPrediction) {
    return (
      <section className="rounded-3xl border border-white/10 bg-[#0d121a] p-5">
        <p className="text-xs font-semibold text-orange-400">
          Live Position
        </p>

        <h2 className="mt-2 text-xl font-bold text-white">
          No active {roundMarket} prediction
        </h2>

        <div className="mt-4 rounded-2xl border border-dashed border-white/10 bg-white/[0.02] p-5 text-center">
          <p className="text-xs leading-5 text-gray-400">
            {pendingPredictions.length > 0
              ? `You have ${pendingPredictions.length} active prediction${pendingPredictions.length === 1 ? "" : "s"} in other markets.`
              : "Submit a Higher or Lower prediction to track your position here."}
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

  const serverSyncStatus =
    currentPrediction.serverSyncStatus ??
    "synced";

  const isOnchainBusy =
    isWaitingForWallet ||
    isConfirmingTransaction ||
    isSyncingServer;

  const statusText =
    serverSyncStatus === "pending"
      ? "SYNCING"
      : serverSyncStatus === "failed"
        ? "SYNC NEEDED"
        : currentPrediction.status === "won"
          ? isClaimed
            ? "CLAIMED"
            : "WON"
          : currentPrediction.status === "lost"
            ? "LOST"
            : status === "resolving"
              ? "RESOLVING"
              : "LIVE";

  const statusStyles =
    serverSyncStatus === "pending"
      ? "border-yellow-500/30 bg-yellow-500/10 text-yellow-300"
      : serverSyncStatus === "failed"
        ? "border-orange-500/30 bg-orange-500/10 text-orange-300"
        : currentPrediction.status === "won"
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

  async function retryServerSync(): Promise<void> {
    const serverRequestId =
      activePrediction.serverRequestId;

    if (!serverRequestId) {
      setTransactionMessage(
        "This prediction does not have a server retry ID."
      );
      return;
    }

    setIsSyncingServer(true);
    setPredictionServerSync(
      activePrediction.id,
      "pending"
    );
    setTransactionMessage(
      `Syncing the confirmed ${activePrediction.market} prediction with the server ledger...`
    );

    try {
      const serverPrediction =
        await submitServerPrediction({
          requestId:
            serverRequestId,
          market:
            activePrediction.market,
          direction:
            activePrediction.direction,
          points:
            activePrediction.points,
          durationSeconds:
            activePrediction.duration ??
            roundDuration,
        });

      const becameSynced =
        setPredictionServerSync(
          activePrediction.id,
          "synced",
          serverPrediction.entryPrice
        );

      if (becameSynced) {
        spendPoints(
          activePrediction.points
        );
      }

      window.dispatchEvent(
        new CustomEvent(
          "predarc:server-balance",
          {
            detail: {
              balance:
                serverPrediction.balance,
              message:
                "Server balance updated after prediction sync.",
            },
          }
        )
      );

      setTransactionMessage(
        `Server ledger synced successfully. Balance: ${Number(
          serverPrediction.balance
        ).toLocaleString()} points.`
      );
    } catch (error) {
      setPredictionServerSync(
        activePrediction.id,
        "failed"
      );

      console.error(
        "Confirmed prediction server retry failed:",
        error
      );

      setTransactionMessage(
        error instanceof Error
          ? error.message
          : "Server ledger sync failed. Retry."
      );
    } finally {
      setIsSyncingServer(false);
    }
  }

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
        `Final ${activePrediction.market} price is not ready yet.`
      );
      return;
    }

    if (!publicClient) {
      setTransactionMessage(
        `${forecastNetworkLabel} client is not ready.`
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
          forecastRegistryAddress,
        abi: FORECAST_REGISTRY_V2_ABI,
        functionName: "resolveForecast",
        args: [
          BigInt(forecastId),
          scaledFinalPrice,
        ],
        chainId: forecastChainId,
      });

      setLatestTransactionHash(hash);
      setIsConfirmingTransaction(true);

      setTransactionMessage(
        `Waiting for ${forecastNetworkLabel} resolution confirmation...`
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
        `${forecastNetworkLabel} client is not ready.`
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
          forecastRegistryAddress,
        abi: FORECAST_REGISTRY_V2_ABI,
        functionName: "claimReward",
        args: [BigInt(forecastId)],
        chainId: forecastChainId,
      });

      setLatestTransactionHash(hash);
      setIsConfirmingTransaction(true);

      setTransactionMessage(
        `Waiting for ${forecastNetworkLabel} claim confirmation...`
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
      {otherActivePredictions.length > 0 && (
        <div className="mb-4 rounded-xl border border-blue-500/20 bg-blue-500/[0.04] p-3">
          <p className="text-[9px] font-black uppercase tracking-[0.16em] text-blue-300">
            Other active predictions
          </p>

          <div className="mt-2 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {otherActivePredictions.map((prediction) => (
              <div
                key={prediction.id}
                className="rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="flex items-center gap-2 text-xs font-bold text-white">
                    <MarketLogo
                      market={prediction.market}
                      className="h-5 w-5"
                    />
                    <span>
                      {prediction.market} ? {formatDuration(prediction.duration)}
                    </span>
                  </span>

                  <span className={
                    prediction.direction === "higher"
                      ? "text-xs font-black text-emerald-400"
                      : "text-xs font-black text-rose-400"
                  }>
                    {prediction.direction === "higher" ? "? HIGHER" : "? LOWER"}
                  </span>
                </div>

                <p className="mt-1 text-[10px] text-gray-400">
                  {prediction.points.toLocaleString()} points ? LIVE
                </p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Compact header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2.5">
          <p className="text-[10px] font-black uppercase tracking-[0.16em] text-orange-400">
            {isSettled
              ? "Prediction Settled"
              : "Your Active Prediction"}
          </p>

          <MarketLogo
            market={currentPrediction.market}
            className="h-7 w-7"
          />

          <span className="text-base font-bold text-white">
            {isServerBackedPrediction
              ? `${currentPrediction.market} server position`
              : `Round #${currentPrediction.roundNumber}`}
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

      {serverSyncStatus !== "synced" && (
        <div className="mt-3 rounded-xl border border-orange-500/25 bg-orange-500/[0.06] p-3">
          <p className="text-[10px] font-bold text-orange-200">
            Arc transaction confirmed
          </p>

          <p className="mt-1 text-[10px] leading-4 text-gray-400">
            {serverSyncStatus === "pending"
              ? "Syncing this prediction with the server ledger..."
              : "The active prediction is preserved locally. Retry the same idempotent request to finish the server ledger sync."}
          </p>

          {serverSyncStatus === "failed" && (
            <button
              type="button"
              onClick={() => {
                void retryServerSync();
              }}
              disabled={isSyncingServer}
              className="mt-2.5 w-full rounded-lg border border-orange-400/40 bg-orange-500/15 px-3 py-2 text-[10px] font-black text-orange-200 transition hover:bg-orange-500/25 disabled:cursor-wait disabled:opacity-50"
            >
              {isSyncingServer
                ? "SYNCING SERVER LEDGER..."
                : "RETRY SERVER SYNC"}
            </button>
          )}
        </div>
      )}

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
              href={`${forecastExplorerBaseUrl}/tx/${latestTransactionHash}`}
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
