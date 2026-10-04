"use client";

import { useState } from "react";

import {
  usePublicClient,
  useWriteContract,
} from "wagmi";

import {
  FORECAST_REGISTRY_V2_ABI,
} from "../../contracts/forecastRegistryV2";

import {
  forecastChainId,
  forecastNetworkLabel,
  forecastRegistryAddress,
} from "@/lib/forecast-network";

import {
  useDemoPoints,
  type PredictionMarket,
} from "../providers/DemoPointsProvider";

import {
  useBtcPrice,
} from "../providers/BtcPriceProvider";

import {
  useVerification,
} from "../providers/VerificationProvider";

import {
  useRound,
  type PredictionDuration,
} from "../providers/RoundProvider";
import { usePredarcSession } from "../providers/PredarcSessionProvider";
import { pointsAsSafeNumber } from "@/lib/predarc-session-core";
import { submitServerPrediction } from "@/lib/prediction-client";

type Direction =
  | "higher"
  | "lower";

const PRICE_SCALE =
  1_000_000;

const SERVER_BALANCE_EVENT =
  "predarc:server-balance";

function formatDuration(
  duration: PredictionDuration
): string {
  if (duration === 60) {
    return "1 Minute";
  }

  if (duration === 300) {
    return "5 Minutes";
  }  if (duration === 3600) {
    return "1 Hour";
  }



  return "15 Minutes";
}

function shortenHash(
  hash: string
): string {
  return `${hash.slice(
    0,
    10
  )}...${hash.slice(-8)}`;
}

function getErrorMessage(
  error: unknown
): string {
  if (!(error instanceof Error)) {
    return "Onchain prediction failed. Please try again.";
  }

  const errorMessage =
    error.message.toLowerCase();

  if (
    errorMessage.includes(
      "user rejected"
    ) ||
    errorMessage.includes(
      "user denied"
    )
  ) {
    return "Transaction was rejected in MetaMask.";
  }

  if (
    errorMessage.includes(
      "forecast already submitted"
    )
  ) {
    return "This forecast ID has already been submitted onchain.";
  }

  if (
    errorMessage.includes(
      "insufficient funds"
    )
  ) {
    return "Not enough Arc Testnet USDC for network gas.";
  }

  return "Onchain prediction failed. Please try again.";
}

export default function PredictionPanel() {
  const {
    predictions,
    spendPoints,
    addPrediction,
    setPredictionServerSync,
  } = useDemoPoints();

  const {
    selectedMarket,
  } = useBtcPrice();

  const {
    isVerified,
  } = useVerification();

  const {
    isSignedIn,
    accountBalance,
  } = usePredarcSession();

  const availablePoints =
    pointsAsSafeNumber(accountBalance);

  const {
    roundNumber,
    isPredictionOpen,
    roundDuration,
    setPredictionDuration,
    canChangeDuration,
    startPrice,
  } = useRound();

  const publicClient =
    usePublicClient({
      chainId:
        forecastChainId,
    });

  const {
    writeContractAsync,
    isPending:
      isWaitingForWallet,
  } = useWriteContract();

  const [
    direction,
    setDirection,
  ] =
    useState<Direction | null>(
      null
    );

  const [
    stake,
    setStake,
  ] =
    useState(100);

  const [
    message,
    setMessage,
  ] =
    useState("");

  const [
    transactionHash,
    setTransactionHash,
  ] =
    useState<
      `0x${string}` | null
    >(null);

  const [
    submittedDirection,
    setSubmittedDirection,
  ] =
    useState<
      Direction | null
    >(null);

  const [
    submittedStake,
    setSubmittedStake,
  ] =
    useState(0);

  const [
    submittedDuration,
    setSubmittedDuration,
  ] =
    useState<
      PredictionDuration | null
    >(null);

  const [
    submittedMarket,
    setSubmittedMarket,
  ] =
    useState<
      PredictionMarket | null
    >(null);

  const [
    isConfirmingTransaction,
    setIsConfirmingTransaction,
  ] =
    useState(false);

  const isOnchainBusy =
    isWaitingForWallet ||
    isConfirmingTransaction;

  const canUsePredictionPanel =
    isSignedIn &&
    isVerified &&
    isPredictionOpen &&
    !isOnchainBusy;

  const canUseTimeframe =
    isSignedIn &&
    isVerified &&
    canChangeDuration &&
    !isOnchainBusy;

  const hasActiveSlotPrediction =
    predictions.some(
      (prediction) =>
        prediction.status ===
          "pending" &&
        prediction.market ===
          selectedMarket &&
        prediction.duration ===
          roundDuration
    );

  const durationOptions:
    PredictionDuration[] = [
    60,
    300,
    900,
            3600,
  ];

  const quickStakeOptions = [
    100,
    250,
    500,
    1000,
  ];

  const isSuccessfulSubmission =
    message.startsWith(
      "Onchain prediction confirmed and server ledger recorded."
    );

  function selectDuration(
    duration:
      PredictionDuration
  ): void {
    if (!isSignedIn) {
      setMessage(
        "Sign in to Predarc before selecting a prediction timeframe."
      );

      return;
    }

    if (!isVerified) {
      setMessage(
        "Complete Arc Testnet verification first."
      );

      return;
    }

    if (isOnchainBusy) {
      setMessage(
        "Wait for the current transaction to finish."
      );

      return;
    }

    if (!canChangeDuration) {
      setMessage(
        "Timeframe is locked for the active prediction."
      );

      return;
    }

    if (
      predictions.some(
        (prediction) =>
          prediction.status ===
            "pending" &&
          prediction.market ===
            selectedMarket &&
          prediction.duration ===
            duration
      )
    ) {
      setMessage(
        "This market and timeframe already has an active prediction."
      );

      return;
    }

    setPredictionDuration(
      duration
    );

    setMessage("");
  }

  function selectDirection(
    selectedDirection:
      Direction
  ): void {
    if (!isSignedIn) {
      setMessage(
        "Sign in to Predarc before selecting a prediction."
      );

      return;
    }

    if (!isVerified) {
      setMessage(
        "Complete Arc Testnet verification first."
      );

      return;
    }

    if (!isPredictionOpen) {
      setMessage(
        "Round is already closed."
      );

      return;
    }

    if (isOnchainBusy) {
      setMessage(
        "Wait for the current transaction to finish."
      );

      return;
    }

    setDirection(
      selectedDirection
    );

    setMessage("");
  }

  async function submitPrediction():
    Promise<void> {
    setMessage("");

    setTransactionHash(
      null
    );

    if (!isSignedIn) {
      setMessage(
        "Sign in to Predarc before predicting."
      );

      return;
    }

    if (!isVerified) {
      setMessage(
        "Complete Arc Testnet verification before predicting."
      );

      return;
    }

    if (!isPredictionOpen) {
      setMessage(
        "Round is already closed."
      );

      return;
    }

    if (isOnchainBusy) {
      setMessage(
        "An onchain transaction is already in progress."
      );

      return;
    }

    if (hasActiveSlotPrediction) {
      setMessage(
        "This market and timeframe already has an active prediction."
      );

      return;
    }

    if (!direction) {
      setMessage(
        "Please choose Higher or Lower."
      );

      return;
    }

    if (
      !Number.isFinite(
        stake
      ) ||
      stake < 10
    ) {
      setMessage(
        "Minimum prediction is 10 demo points."
      );

      return;
    }

    if (
      stake >
      availablePoints
    ) {
      setMessage(
        "Not enough server points."
      );

      return;
    }

    if (
      startPrice ===
        null ||
      !Number.isFinite(
        startPrice
      ) ||
      startPrice <= 0
    ) {
      setMessage(
        `${selectedMarket} round entry price is not ready yet.`
      );

      return;
    }

    if (!publicClient) {
      setMessage(
        "Arc Testnet client is not ready. Reconnect your wallet."
      );

      return;
    }

    const submittedMarketValue =
      selectedMarket as
        PredictionMarket;

    const submittedDirectionValue =
      direction;

    const submittedStakeValue =
      stake;

    const submittedDurationValue =
      roundDuration;

    const submittedRoundNumber =
      roundNumber;

    const submittedStartPrice =
      startPrice;

    const serverRequestId =
      crypto.randomUUID();

    try {
      setMessage(
        `Confirm the ${submittedMarketValue} forecast transaction in MetaMask.`
      );

      const onchainForecastId =
        BigInt(
          Date.now()
        );

      const scaledStartPrice =
        BigInt(
          Math.round(
            submittedStartPrice * PRICE_SCALE
          )
        );

      const directionValue =
        submittedDirectionValue ===
        "higher"
          ? 0
          : 1;

      const hash =
        await writeContractAsync(
          {
            address:
              forecastRegistryAddress,

            abi:
              FORECAST_REGISTRY_V2_ABI,

            functionName:
              "submitForecast",

            args: [
              onchainForecastId,
              directionValue,
              submittedDurationValue,
              BigInt(
                submittedStakeValue
              ),
              scaledStartPrice,
            ],

            chainId:
              forecastChainId,
          }
        );

      setTransactionHash(
        hash
      );

      setIsConfirmingTransaction(
        true
      );

      setMessage(
        `Waiting for ${forecastNetworkLabel} confirmation for ${submittedMarketValue} forecast...`
      );

      const receipt =
        await publicClient.waitForTransactionReceipt(
          {
            hash,
            confirmations: 1,
          }
        );

      if (
        receipt.status !==
        "success"
      ) {
        throw new Error(
          "Transaction confirmation failed."
        );
      }

      setMessage(
        "Arc transaction confirmed. Saving the active prediction and syncing the server ledger..."
      );

      /*
       * Persist the confirmed Arc transaction before the
       * server request. If the network request fails, the
       * user can safely retry with the same request ID.
       */
      const localPredictionId =
        addPrediction(
          submittedRoundNumber,
          submittedDirectionValue,
          submittedStakeValue,
          submittedDurationValue,
          {
            forecastId:
              onchainForecastId,

            transactionHash:
              hash,

            entryPrice:
              submittedStartPrice,

            serverRequestId,

            serverSyncStatus:
              "pending",
          },
          submittedMarketValue
        );

      setSubmittedDirection(
        submittedDirectionValue
      );

      setSubmittedStake(
        submittedStakeValue
      );

      setSubmittedDuration(
        submittedDurationValue
      );

      setSubmittedMarket(
        submittedMarketValue
      );

      try {
        const serverPrediction =
          await submitServerPrediction(
            {
              requestId:
                serverRequestId,
              market:
                submittedMarketValue,
              direction:
                submittedDirectionValue,
              points:
                submittedStakeValue,
              durationSeconds:
                submittedDurationValue,
            }
          );

        const becameSynced =
          setPredictionServerSync(
            localPredictionId,
            "synced",
            serverPrediction.entryPrice
          );

        if (becameSynced) {
          spendPoints(
            submittedStakeValue
          );
        }

        window.dispatchEvent(
          new CustomEvent(
            SERVER_BALANCE_EVENT,
            {
              detail: {
                balance:
                  serverPrediction.balance,
                message:
                  "Server balance updated after prediction.",
              },
            }
          )
        );

        setMessage(
          `Onchain prediction confirmed and server ledger recorded. Server balance: ${Number(
            serverPrediction.balance
          ).toLocaleString()} points.`
        );
      } catch (serverError) {
        setPredictionServerSync(
          localPredictionId,
          "failed"
        );

        console.error(
          "Server ledger sync failed after confirmed Arc transaction:",
          serverError
        );

        setMessage(
          "Arc transaction confirmed and the active prediction was preserved. Server ledger sync needs a retry from the active prediction card."
        );
      }
    } catch (error) {
      console.error(
        "Onchain prediction submission failed:",
        error
      );

      setMessage(
        getErrorMessage(
          error
        )
      );
    } finally {
      setIsConfirmingTransaction(
        false
      );
    }
  }

  return (
    <section className="relative overflow-hidden rounded-3xl border border-white/10 bg-[#0d121a] p-4">
      <div className="pointer-events-none absolute -right-20 -top-20 h-48 w-48 rounded-full bg-orange-500/[0.05] blur-3xl" />

      <div className="relative">
        {/* Header */}
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-orange-400">
              Make Your Prediction
            </p>

            <h2 className="mt-1 text-xl font-black text-white">
              Round #
              {roundNumber}
            </h2>

            <div className="mt-2 flex flex-wrap items-center gap-2">
              <span className="rounded-full border border-orange-500/30 bg-orange-500/10 px-2.5 py-1 text-[9px] font-black text-orange-400">
                {selectedMarket}
                /USDT
              </span>

              <p className="text-[10px] leading-4 text-gray-500">
                Forecast on Arc Testnet
              </p>
            </div>
          </div>

          <span
            className={`shrink-0 rounded-full border px-2.5 py-1 text-[9px] font-bold ${
              isSignedIn && isVerified
                ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-400"
                : "border-orange-500/30 bg-orange-500/10 text-orange-400"
            }`}
          >
            {isSignedIn && isVerified
              ? "✓ ONCHAIN READY"
              : !isSignedIn
                ? "🔒 SIGN IN"
                : "🔒 VERIFY"}
          </span>
        </div>

        {(!isSignedIn || !isVerified) && (
          <div className="mt-3 rounded-xl border border-orange-500/30 bg-orange-500/[0.08] p-3 text-center">
            <p className="text-xs font-semibold text-orange-400">
              Prediction access
              locked
            </p>

            <p className="mt-1 text-[10px] leading-4 text-gray-400">
              {!isSignedIn
                ? "Connect and sign in above to load your server points."
                : "Complete the existing Arc Testnet onchain verification."}
            </p>
          </div>
        )}

        {/* Timeframe */}
        <div className="mt-4">
          <div className="flex items-center justify-between">
            <p className="text-[11px] font-semibold text-white">
              Timeframe
            </p>

            {!canUseTimeframe &&
              isVerified && (
                <span className="text-[9px] font-semibold text-yellow-400">
                  LOCKED
                </span>
              )}
          </div>

          <div className="mt-2 grid grid-cols-4 gap-2">
            {durationOptions.map(
              (
                duration
              ) => {
                const isSelected =
                  roundDuration ===
                  duration;

                return (
                  <button
                    key={
                      duration
                    }
                    type="button"
                    disabled={
                      !canUseTimeframe
                    }
                    onClick={() =>
                      selectDuration(
                        duration
                      )
                    }
                    className={`rounded-lg border px-2 py-2 transition ${
                      isSelected
                        ? "border-orange-500 bg-orange-500/15 text-orange-400"
                        : "border-white/10 bg-white/[0.02] text-gray-400 hover:border-orange-500/40 hover:text-white"
                    } disabled:cursor-not-allowed disabled:opacity-40`}
                  >
                    <span className="block text-xs font-black">
                      {duration ===
                      60
                        ? "1m"
                        : duration ===
                            300
                          ? "5m"
                          : duration ===
                              900
                            ? "15m"
                            : "1h"}
                    </span>

                    <span className="mt-0.5 block text-[8px] uppercase tracking-wide opacity-60">
                      {duration ===
                      60
                        ? "Quick"
                        : duration ===
                            300
                          ? "Standard"
                          : duration ===
                              900
                            ? "Extended"
                            : "Long"}
                    </span>
                  </button>
                );
              }
            )}
          </div>
        </div>

        {/* Direction */}
        <div className="mt-4">
          <p className="text-[11px] font-semibold text-white">
            Direction
          </p>

          <div className="mt-2 grid grid-cols-2 gap-2">
            <button
              type="button"
              disabled={
                !canUsePredictionPanel
              }
              onClick={() =>
                selectDirection(
                  "higher"
                )
              }
              className={`min-h-[94px] rounded-2xl border p-3 transition ${
                direction ===
                "higher"
                  ? "border-emerald-400 bg-emerald-500/15 ring-1 ring-emerald-400/70"
                  : "border-white/10 bg-white/[0.02] hover:border-emerald-500/50 hover:bg-emerald-500/[0.06]"
              } disabled:cursor-not-allowed disabled:opacity-40`}
            >
              <span className="block text-3xl font-black leading-none text-emerald-400">
                ↗
              </span>

              <p className="mt-2 text-sm font-black text-emerald-400">
                HIGHER
              </p>

              <p className="mt-1 text-[9px] text-gray-500">
                Above{" "}
                {selectedMarket}{" "}
                entry price
              </p>

              {direction ===
                "higher" && (
                <span className="mt-1.5 inline-flex rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 text-[8px] font-bold text-emerald-400">
                  SELECTED
                </span>
              )}
            </button>

            <button
              type="button"
              disabled={
                !canUsePredictionPanel
              }
              onClick={() =>
                selectDirection(
                  "lower"
                )
              }
              className={`min-h-[94px] rounded-2xl border p-3 transition ${
                direction ===
                "lower"
                  ? "border-rose-400 bg-rose-500/15 ring-1 ring-rose-400/70"
                  : "border-white/10 bg-white/[0.02] hover:border-rose-500/50 hover:bg-rose-500/[0.06]"
              } disabled:cursor-not-allowed disabled:opacity-40`}
            >
              <span className="block text-3xl font-black leading-none text-rose-400">
                ↘
              </span>

              <p className="mt-2 text-sm font-black text-rose-400">
                LOWER
              </p>

              <p className="mt-1 text-[9px] text-gray-500">
                Below{" "}
                {selectedMarket}{" "}
                entry price
              </p>

              {direction ===
                "lower" && (
                <span className="mt-1.5 inline-flex rounded-full border border-rose-500/30 bg-rose-500/10 px-2 py-0.5 text-[8px] font-bold text-rose-400">
                  SELECTED
                </span>
              )}
            </button>
          </div>
        </div>

        {/* Points */}
        <div className="mt-4 rounded-xl border border-white/10 bg-black/10 p-3">
          <div className="flex items-center justify-between">
            <label
              htmlFor="prediction-stake"
              className="text-[11px] font-semibold text-white"
            >
              Demo Points
            </label>

            <p className="text-[9px] text-gray-500">
              Available:{" "}
              <span className="font-semibold text-gray-300">
                {isSignedIn
                  ? availablePoints.toLocaleString()
                  : "—"}
              </span>
            </p>
          </div>

          <div className="mt-2 flex items-center rounded-lg border border-white/10 bg-[#111827] px-3 focus-within:border-orange-500">
            <input
              id="prediction-stake"
              type="number"
              min={10}
              value={stake}
              disabled={
                !canUsePredictionPanel
              }
              onChange={(
                event
              ) =>
                setStake(
                  Number(
                    event
                      .target
                      .value
                  )
                )
              }
              className="w-full bg-transparent py-2.5 text-xs font-bold text-white outline-none disabled:cursor-not-allowed disabled:opacity-40"
            />

            <span className="text-[9px] font-bold text-orange-400">
              POINTS
            </span>
          </div>

          <div className="mt-2 flex flex-wrap gap-1">
            {quickStakeOptions.map(
              (
                amount
              ) => (
                <button
                  key={
                    amount
                  }
                  type="button"
                  disabled={
                    !canUsePredictionPanel ||
                    amount >
                      availablePoints
                  }
                  onClick={() =>
                    setStake(
                      amount
                    )
                  }
                  className="rounded-md border border-white/10 bg-white/[0.02] px-2 py-1 text-[9px] font-semibold text-gray-400 transition hover:border-orange-500/40 hover:text-orange-400 disabled:cursor-not-allowed disabled:opacity-30"
                >
                  {amount.toLocaleString()}
                </button>
              )
            )}

            <button
              type="button"
              disabled={
                !canUsePredictionPanel ||
                availablePoints < 10
              }
              onClick={() =>
                setStake(
                  availablePoints
                )
              }
              className="rounded-md border border-white/10 bg-white/[0.02] px-2 py-1 text-[9px] font-semibold text-gray-400 transition hover:border-orange-500/40 hover:text-orange-400 disabled:cursor-not-allowed disabled:opacity-30"
            >
              MAX
            </button>
          </div>
        </div>

        <p className="mt-3 text-[9px] leading-4 text-blue-200/70">
          ⛓{" "}
          {selectedMarket}{" "}
          forecast stored
          through Arc Testnet.
          Test USDC pays gas
          only.
        </p>

        {/* Submit */}
        <button
          type="button"
          onClick={
            submitPrediction
          }
          disabled={
            !isSignedIn ||
            !isVerified ||
            availablePoints < 10 ||
            !isPredictionOpen ||
            isOnchainBusy
          }
          className="mt-3 w-full rounded-xl border border-orange-400/40 bg-gradient-to-r from-orange-600 to-orange-500 px-4 py-3.5 text-[11px] font-black tracking-wide text-white transition hover:-translate-y-0.5 hover:from-orange-500 hover:to-orange-400 disabled:cursor-not-allowed disabled:border-white/10 disabled:bg-none disabled:bg-white/5 disabled:text-gray-500 disabled:hover:translate-y-0"
        >
          {!isSignedIn
            ? "SIGN IN TO PREDICT"
            : !isVerified
              ? "VERIFY ONCHAIN TO PREDICT"
              : isWaitingForWallet
                ? "CONFIRM IN METAMASK..."
                : isConfirmingTransaction
                  ? "WAITING FOR ARC CONFIRMATION..."
                  : !isPredictionOpen
                    ? "ROUND CLOSED"
                    : direction
                      ? `SUBMIT ${selectedMarket} ${direction.toUpperCase()} ONCHAIN`
                      : "SELECT HIGHER OR LOWER"}
        </button>

        {/* Status */}
        {message && (
          <div
            className={`mt-3 rounded-xl border p-3 ${
              isSuccessfulSubmission
                ? "border-emerald-500/30 bg-emerald-500/[0.08]"
                : "border-orange-500/30 bg-orange-500/[0.08]"
            }`}
          >
            <p
              className={`text-[10px] font-semibold ${
                isSuccessfulSubmission
                  ? "text-emerald-400"
                  : "text-orange-400"
              }`}
            >
              {message}
            </p>

            {transactionHash && (
              <div className="mt-2 rounded-lg border border-white/10 bg-black/10 p-2.5">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-[9px] text-gray-500">
                    Arc Testnet
                    transaction
                  </p>

                  <p className="font-mono text-[9px] text-gray-300">
                    {shortenHash(
                      transactionHash
                    )}
                  </p>
                </div>

                <a
                  href={`https://testnet.arcscan.app/tx/${transactionHash}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-2 flex w-full items-center justify-center rounded-lg border border-blue-500/30 bg-blue-500/[0.08] px-3 py-2 text-[10px] font-bold text-blue-300 transition hover:border-blue-400/50 hover:bg-blue-500/[0.14] hover:text-blue-200"
                >
                  View on Arc
                  Explorer ↗
                </a>
              </div>
            )}

            {isSuccessfulSubmission &&
              submittedDirection &&
              submittedDuration !==
                null &&
              submittedMarket && (
                <div className="mt-2 grid grid-cols-2 gap-1.5 sm:grid-cols-4">
                  <div className="rounded-lg border border-white/10 bg-black/10 p-2">
                    <p className="text-[8px] text-gray-500">
                      Market
                    </p>

                    <p className="mt-1 text-[10px] font-bold text-orange-400">
                      {
                        submittedMarket
                      }
                    </p>
                  </div>

                  <div className="rounded-lg border border-white/10 bg-black/10 p-2">
                    <p className="text-[8px] text-gray-500">
                      Direction
                    </p>

                    <p
                      className={`mt-1 text-[10px] font-bold ${
                        submittedDirection ===
                        "higher"
                          ? "text-emerald-400"
                          : "text-rose-400"
                      }`}
                    >
                      {submittedDirection.toUpperCase()}
                    </p>
                  </div>

                  <div className="rounded-lg border border-white/10 bg-black/10 p-2">
                    <p className="text-[8px] text-gray-500">
                      Stake
                    </p>

                    <p className="mt-1 text-[10px] font-bold text-white">
                      {submittedStake.toLocaleString()}
                    </p>
                  </div>

                  <div className="rounded-lg border border-white/10 bg-black/10 p-2">
                    <p className="text-[8px] text-gray-500">
                      Timeframe
                    </p>

                    <p className="mt-1 text-[10px] font-bold text-white">
                      {formatDuration(
                        submittedDuration
                      )}
                    </p>
                  </div>
                </div>
              )}
          </div>
        )}
      </div>
    </section>
  );
}
