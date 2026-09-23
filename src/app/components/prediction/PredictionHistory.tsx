"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";

import {
  usePublicClient,
  useWriteContract,
} from "wagmi";

import {
  arcTestnet,
} from "viem/chains";

import {
  FORECAST_REGISTRY_V2_ABI,
  FORECAST_REGISTRY_V2_ADDRESS,
} from "../../contracts/forecastRegistryV2";

import {
  useDemoPoints,
  type PredictionMarket,
  type PredictionRecord,
} from "../providers/DemoPointsProvider";

const RPC_READ_TIMEOUT_MS =
  8000;

const RECEIPT_TIMEOUT_MS =
  45000;

const SERVER_BALANCE_EVENT =
  "predarc:server-balance";

type ServerPrediction = {
  id: string;
  market: PredictionMarket;
  direction:
    | "higher"
    | "lower";
  points: number;
  duration_seconds: number;
  status: string;
  entry_price: string;
  accepted_at: string;
  closes_at: string;
  claimed: boolean;
};

function isServerPredictionClosed(
  prediction: ServerPrediction
): boolean {
  const closesAt =
    Date.parse(
      prediction.closes_at
    );

  return (
    Number.isFinite(
      closesAt
    ) &&
    closesAt <= Date.now()
  );
}

function getMarketDecimals(
  market: PredictionMarket
): number {
  if (market === "XRP") {
    return 4;
  }

  return 2;
}

function formatPrice(
  price: number | null,
  market: PredictionMarket
): string {
  if (
    price === null ||
    !Number.isFinite(price)
  ) {
    return "Not recorded";
  }

  const decimals =
    getMarketDecimals(
      market
    );

  return `$${price.toLocaleString(
    undefined,
    {
      minimumFractionDigits:
        decimals,

      maximumFractionDigits:
        decimals,
    }
  )}`;
}

function formatDifference(
  difference: number | null,
  market: PredictionMarket
): string {
  if (
    difference === null ||
    !Number.isFinite(
      difference
    )
  ) {
    return "Not recorded";
  }

  const sign =
    difference >= 0
      ? "+"
      : "-";

  const decimals =
    getMarketDecimals(
      market
    );

  return `${sign}$${Math.abs(
    difference
  ).toLocaleString(
    undefined,
    {
      minimumFractionDigits:
        decimals,

      maximumFractionDigits:
        decimals,
    }
  )}`;
}

function formatDuration(
  duration:
    | 60
    | 300
    | 900
    | null
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

function formatServerDate(
  value: string
): string {
  const timestamp =
    Date.parse(value);

  if (
    !Number.isFinite(
      timestamp
    )
  ) {
    return "Not recorded";
  }

  return new Date(
    timestamp
  ).toLocaleString(
    [],
    {
      dateStyle:
        "medium",
      timeStyle:
        "short",
    }
  );
}

function shortenHash(
  hash: string
): string {
  return `${hash.slice(
    0,
    10
  )}...${hash.slice(-8)}`;
}

function getErrorText(
  error: unknown
): string {
  if (
    !(error instanceof Error)
  ) {
    return "";
  }

  return error.message.toLowerCase();
}

function withTimeout<T>(
  promise: Promise<T>,
  milliseconds: number,
  timeoutMessage: string
): Promise<T> {
  return new Promise<T>(
    (
      resolve,
      reject
    ) => {
      const timeoutId =
        window.setTimeout(
          () => {
            reject(
              new Error(
                timeoutMessage
              )
            );
          },
          milliseconds
        );

      promise
        .then(
          (value) => {
            window.clearTimeout(
              timeoutId
            );

            resolve(
              value
            );
          }
        )
        .catch(
          (error) => {
            window.clearTimeout(
              timeoutId
            );

            reject(
              error
            );
          }
        );
    }
  );
}

export default function PredictionHistory() {
  const {
    predictions,

    setResolveTransaction,

    markResolvedOnchain,

    syncClaimedReward,
  } = useDemoPoints();

  const publicClient =
    usePublicClient({
      chainId:
        arcTestnet.id,
    });

  const {
    writeContractAsync,

    isPending:
      isWaitingForWallet,
  } = useWriteContract();

  const [
    processingPredictionId,
    setProcessingPredictionId,
  ] =
    useState<
      number | null
    >(null);

  const [
    processingAction,
    setProcessingAction,
  ] =
    useState<
      | "resolve"
      | "claim"
      | "sync"
      | null
    >(null);

  const [
    messages,
    setMessages,
  ] =
    useState<
      Record<
        number,
        string
      >
    >({});

  const [
    serverPredictions,
    setServerPredictions,
  ] =
    useState<
      ServerPrediction[]
    >([]);

  const [
    serverHistoryMessage,
    setServerHistoryMessage,
  ] =
    useState("");

  const [
    isLoadingServerHistory,
    setIsLoadingServerHistory,
  ] =
    useState(false);

  const [
    serverProcessingId,
    setServerProcessingId,
  ] =
    useState<
      string | null
    >(null);

  const [
    serverRecordMessages,
    setServerRecordMessages,
  ] =
    useState<
      Record<
        string,
        string
      >
    >({});

  const [
    latestHashes,
    setLatestHashes,
  ] =
    useState<
      Record<
        number,
        `0x${string}` | undefined
      >
    >({});

  const loadServerHistory =
    useCallback(
      async () => {
        setIsLoadingServerHistory(
          true
        );

        try {
          const response =
            await fetch(
              "/api/predictions",
              {
                cache:
                  "no-store",
                credentials: "include",
              }
            );

          const result =
            await response.json();

          if (!response.ok) {
            throw new Error(
              typeof result?.error ===
                "string"
                ? result.error
                : "Could not load server prediction history."
            );
          }

          const records =
            Array.isArray(
              result?.predictions
            )
              ? result.predictions
              : [];

          setServerPredictions(
            records.flatMap(
              (
                record: unknown
              ): ServerPrediction[] => {
                if (
                  typeof record !==
                    "object" ||
                  record === null ||
                  !("id" in record) ||
                  !("market" in record) ||
                  !("direction" in record) ||
                  !("points" in record) ||
                  !("durationSeconds" in record) ||
                  !("status" in record) ||
                  !("entryPrice" in record) ||
                  !("acceptedAt" in record) ||
                  !("closesAt" in record) ||
                  !("claimStatus" in record)
                ) {
                  return [];
                }

                const points =
                  Number(record.points);

                const durationSeconds =
                  Number(
                    record.durationSeconds
                  );

                const entryPrice =
                  Number(
                    record.entryPrice
                  );

                if (
                  typeof record.id !==
                    "string" ||
                  typeof record.market !==
                    "string" ||
                  !(
                    record.market ===
                      "BTC" ||
                    record.market ===
                      "ETH" ||
                    record.market ===
                      "SOL" ||
                    record.market ===
                      "BNB" ||
                    record.market ===
                      "XRP"
                  ) ||
                  !(
                    record.direction ===
                      "higher" ||
                    record.direction ===
                      "lower"
                  ) ||
                  !Number.isFinite(
                    points
                  ) ||
                  !Number.isFinite(
                    durationSeconds
                  ) ||
                  !Number.isFinite(
                    entryPrice
                  ) ||
                  typeof record.status !==
                    "string" ||
                  typeof record.acceptedAt !==
                    "string" ||
                  typeof record.closesAt !==
                    "string"
                ) {
                  return [];
                }

                return [
                  {
                    id:
                      record.id,
                    market:
                      record.market,
                    direction:
                      record.direction,
                    points,
                    duration_seconds:
                      durationSeconds,
                    status:
                      record.status,
                    entry_price:
                      entryPrice.toString(),
                    accepted_at:
                      record.acceptedAt,
                    closes_at:
                      record.closesAt,
                    claimed:
                      record.claimStatus === "claimed",
                  },
                ];
              }
            )
          );

          setServerHistoryMessage(
            "Server prediction history refreshed."
          );
        } catch (error) {
          setServerHistoryMessage(
            error instanceof Error
              ? error.message
              : "Could not load server prediction history."
          );
        } finally {
          setIsLoadingServerHistory(
            false
          );
        }
      },
      []
    );

  const settleServerPrediction =
    useCallback(
      async (
        prediction: ServerPrediction
      ) => {
        setServerProcessingId(
          prediction.id
        );

        setServerRecordMessages(
          (
            currentMessages
          ) => ({
            ...currentMessages,

            [prediction.id]:
              "Settling server result...",
          })
        );

        try {
          const response =
            await fetch(
              "/api/predictions/settle",
              {
                method:
                  "POST",
                credentials: "include",
                headers: {
                  "Content-Type":
                    "application/json",
                },
                body:
                  JSON.stringify(
                    {
                      predictionId:
                        prediction.id,
                      market:
                        prediction.market,
                    }
                  ),
              }
            );

          const result =
            await response.json();

          if (!response.ok) {
            throw new Error(
              typeof result?.error ===
                "string"
                ? result.error
                : "Could not settle server prediction."
            );
          }

          const status =
            typeof result
              ?.prediction
              ?.status ===
            "string"
              ? result.prediction
                  .status
              : "settled";

          setServerRecordMessages(
            (
              currentMessages
            ) => ({
              ...currentMessages,

              [prediction.id]:
                `Server result settled: ${status}.`,
            })
          );

          window.dispatchEvent(
            new Event(
              SERVER_BALANCE_EVENT
            )
          );

          await loadServerHistory();
        } catch (error) {
          setServerRecordMessages(
            (
              currentMessages
            ) => ({
              ...currentMessages,

              [prediction.id]:
                error instanceof Error
                  ? error.message
                  : "Could not settle server prediction.",
            })
          );
        } finally {
          setServerProcessingId(
            null
          );
        }
      },
      [
        loadServerHistory,
      ]
    );

  const claimServerPrediction =
    useCallback(
      async (
        prediction: ServerPrediction
      ) => {
        setServerProcessingId(
          prediction.id
        );

        setServerRecordMessages(
          (
            currentMessages
          ) => ({
            ...currentMessages,

            [prediction.id]:
              "Claiming server reward...",
          })
        );

        try {
          const response =
            await fetch(
              "/api/predictions/claim",
              {
                method:
                  "POST",
                credentials: "include",
                headers: {
                  "Content-Type":
                    "application/json",
                },
                body:
                  JSON.stringify(
                    {
                      predictionId:
                        prediction.id,
                    }
                  ),
              }
            );

          const result =
            await response.json();

          if (!response.ok) {
            throw new Error(
              typeof result?.error ===
                "string"
                ? result.error
                : "Could not claim server reward."
            );
          }

          const reward =
            typeof result?.reward ===
            "string"
              ? result.reward
              : (
                  prediction.points * 2
                ).toString();

          setServerRecordMessages(
            (
              currentMessages
            ) => ({
              ...currentMessages,

              [prediction.id]:
                result.replayed === true
                  ? "Server reward was already claimed."
                  : `Claimed ${Number(
                      reward
                    ).toLocaleString()} server points.`,
            })
          );

          window.dispatchEvent(
            new Event(
              SERVER_BALANCE_EVENT
            )
          );

          await loadServerHistory();
        } catch (error) {
          setServerRecordMessages(
            (
              currentMessages
            ) => ({
              ...currentMessages,

              [prediction.id]:
                error instanceof Error
                  ? error.message
                  : "Could not claim server reward.",
            })
          );
        } finally {
          setServerProcessingId(
            null
          );
        }
      },
      [
        loadServerHistory,
      ]
    );

  /*
   * Prevent automatic claim-sync
   * from repeatedly checking the
   * same prediction on every render.
   */
  const autoSyncCheckedRef =
    useRef<
      Set<number>
    >(new Set());

  useEffect(() => {
    void loadServerHistory();
  }, [
    loadServerHistory,
  ]);

  useEffect(() => {
    function refreshServerHistory() {
      void loadServerHistory();
    }

    window.addEventListener(
      SERVER_BALANCE_EVENT,
      refreshServerHistory
    );

    return () => {
      window.removeEventListener(
        SERVER_BALANCE_EVENT,
        refreshServerHistory
      );
    };
  }, [
    loadServerHistory,
  ]);

  function updateMessage(
    predictionId: number,
    message: string
  ): void {
    setMessages(
      (
        currentMessages
      ) => ({
        ...currentMessages,

        [predictionId]:
          message,
      })
    );
  }

  async function readHasClaimed(
    forecastId: string
  ): Promise<boolean> {
    if (!publicClient) {
      throw new Error(
        "Arc Testnet client unavailable."
      );
    }

    const request =
      publicClient.readContract({
        address:
          FORECAST_REGISTRY_V2_ADDRESS,

        abi:
          FORECAST_REGISTRY_V2_ABI,

        functionName:
          "hasClaimed",

        args: [
          BigInt(
            forecastId
          ),
        ],
      });

    const result =
      await withTimeout(
        request,

        RPC_READ_TIMEOUT_MS,

        "Arc claim-status read timed out."
      );

    return result === true;
  }

  async function syncPredictionClaim(
    prediction:
      PredictionRecord
  ): Promise<void> {
    if (
      !prediction.forecastId ||
      prediction.claimed ||
      prediction.status !==
        "won"
    ) {
      return;
    }

    if (!publicClient) {
      updateMessage(
        prediction.id,

        "Arc Testnet client is unavailable."
      );

      return;
    }

    try {
      setProcessingPredictionId(
        prediction.id
      );

      setProcessingAction(
        "sync"
      );

      updateMessage(
        prediction.id,

        "Checking claim status on Arc Testnet..."
      );

      const hasClaimed =
        await readHasClaimed(
          prediction.forecastId
        );

      if (!hasClaimed) {
        updateMessage(
          prediction.id,

          "Reward has not been claimed onchain yet."
        );

        return;
      }

      const synced =
        syncClaimedReward(
          prediction.id,

          latestHashes[
            prediction.id
          ]
        );

      if (synced) {
        updateMessage(
          prediction.id,

          "Successful onchain claim detected. Arena balance updated."
        );
      } else {
        updateMessage(
          prediction.id,

          "Claim is already synced locally."
        );
      }
    } catch (error) {
      console.error(
        "Claim sync failed:",

        error
      );

      const errorText =
        getErrorText(
          error
        );

      if (
        errorText.includes(
          "timed out"
        )
      ) {
        updateMessage(
          prediction.id,

          "Arc RPC did not respond in time. Try Sync Claim Status again."
        );
      } else {
        updateMessage(
          prediction.id,

          "Could not read claim status from Arc Testnet."
        );
      }
    } finally {
      setProcessingPredictionId(
        null
      );

      setProcessingAction(
        null
      );
    }
  }

  async function resolvePredictionOnchain(
    prediction:
      PredictionRecord
  ): Promise<void> {
    if (
      !prediction.forecastId ||
      prediction.endPrice === null ||
      prediction.startPrice === null
    ) {
      updateMessage(
        prediction.id,
        "Forecast data is incomplete."
      );

      return;
    }

    if (!publicClient) {
      updateMessage(
        prediction.id,
        "Arc Testnet client is unavailable."
      );

      return;
    }

    try {
      setProcessingPredictionId(
        prediction.id
      );

      setProcessingAction(
        "resolve"
      );

      updateMessage(
        prediction.id,
        "Checking forecast state on Arc Testnet..."
      );

      const onchainForecast =
        await publicClient.readContract({
          address:
            FORECAST_REGISTRY_V2_ADDRESS,

          abi:
            FORECAST_REGISTRY_V2_ABI,

          functionName:
            "getForecast",

          args: [
            BigInt(
              prediction.forecastId
            ),
          ],
        }) as {
          forecastId: bigint;
          user: `0x${string}`;
          direction: number;
          duration: number;
          arenaPoints: bigint;
          startPrice: bigint;
          endPrice: bigint;
          submittedAt: bigint;
          resolvedAt: bigint;
          claimableReward: bigint;
          status: number;
          claimed: boolean;
          exists: boolean;
        };

      if (!onchainForecast.exists) {
        updateMessage(
          prediction.id,
          "This forecast does not exist onchain."
        );

        return;
      }

      /*
       * Do not send another resolve transaction
       * when the contract already has an end price
       * or resolution timestamp.
       */
      if (
        onchainForecast.endPrice > BigInt(0) ||
        onchainForecast.resolvedAt > BigInt(0)
      ) {
        markResolvedOnchain(
          prediction.id
        );

        updateMessage(
          prediction.id,
          "Forecast is already resolved onchain. Local status updated."
        );

        return;
      }

      /*
       * Detect which price precision was used
       * when this forecast was originally submitted.
       *
       * Legacy forecasts: x100
       * New forecasts:    x1,000,000
       */
      const legacyStartPrice =
        BigInt(
          Math.round(
            prediction.startPrice *
              100
          )
        );

      const preciseStartPrice =
        BigInt(
          Math.round(
            prediction.startPrice *
              1_000_000
          )
        );

      let detectedPriceScale:
        100 | 1_000_000;

      if (
        onchainForecast.startPrice ===
        preciseStartPrice
      ) {
        detectedPriceScale =
          1_000_000;
      } else if (
        onchainForecast.startPrice ===
        legacyStartPrice
      ) {
        detectedPriceScale =
          100;
      } else {
        updateMessage(
          prediction.id,
          "Could not safely match the local start price with the onchain forecast. Resolution was not submitted."
        );

        return;
      }

      const scaledEndPrice =
        BigInt(
          Math.round(
            prediction.endPrice *
              detectedPriceScale
          )
        );

      /*
       * Old x100 forecasts can lose small price
       * movements, especially XRP.
       *
       * Example:
       * 1.3984 -> 140
       * 1.3982 -> 140
       *
       * In that case we intentionally do NOT
       * waste gas on a resolution that cannot
       * represent the actual movement.
       */
      if (
        scaledEndPrice ===
        onchainForecast.startPrice
      ) {
        updateMessage(
          prediction.id,
          detectedPriceScale === 100
            ? "Legacy forecast precision is insufficient for this price movement. No resolution transaction was submitted."
            : "The scaled start and end prices are equal. Waiting for a resolvable price difference."
        );

        return;
      }

      updateMessage(
        prediction.id,
        `Confirm forecast resolution in MetaMask. Price precision: x${detectedPriceScale.toLocaleString()}.`
      );

      const hash =
        await writeContractAsync({
          address:
            FORECAST_REGISTRY_V2_ADDRESS,

          abi:
            FORECAST_REGISTRY_V2_ABI,

          functionName:
            "resolveForecast",

          args: [
            BigInt(
              prediction.forecastId
            ),

            scaledEndPrice,
          ],

          chainId:
            arcTestnet.id,
        });

      setLatestHashes(
        (
          currentHashes
        ) => ({
          ...currentHashes,

          [prediction.id]:
            hash,
        })
      );

      updateMessage(
        prediction.id,
        "Resolution submitted. Waiting for Arc confirmation..."
      );

      const receipt =
        await withTimeout(
          publicClient.waitForTransactionReceipt(
            {
              hash,
              confirmations: 1,
            }
          ),

          RECEIPT_TIMEOUT_MS,

          "Resolution receipt timed out."
        );

      if (
        receipt.status !==
        "success"
      ) {
        throw new Error(
          "Resolution failed."
        );
      }

      setResolveTransaction(
        prediction.id,
        hash
      );

      updateMessage(
        prediction.id,
        "Forecast resolved successfully. Reward status updated."
      );
    } catch (error) {
      console.error(
        "Forecast resolution failed:",
        error
      );

      const errorText =
        getErrorText(
          error
        );

      if (
        errorText.includes(
          "already resolved"
        )
      ) {
        markResolvedOnchain(
          prediction.id
        );

        updateMessage(
          prediction.id,
          "Forecast was already resolved onchain. Local status updated."
        );

        return;
      }

      if (
        errorText.includes(
          "user rejected"
        ) ||
        errorText.includes(
          "user denied"
        )
      ) {
        updateMessage(
          prediction.id,
          "Resolution transaction was rejected in MetaMask."
        );

        return;
      }

      if (
        errorText.includes(
          "timed out"
        )
      ) {
        updateMessage(
          prediction.id,
          "Resolution may still be pending or Arc RPC is delayed. Check Arc Explorer before retrying."
        );

        return;
      }

      updateMessage(
        prediction.id,
        "Forecast resolution failed. No local reward state was changed."
      );
    } finally {
      setProcessingPredictionId(
        null
      );

      setProcessingAction(
        null
      );
    }
  }
  async function claimPredictionReward(
    prediction:
      PredictionRecord
  ): Promise<void> {
    if (
      !prediction.forecastId
    ) {
      updateMessage(
        prediction.id,

        "Forecast ID is unavailable."
      );

      return;
    }

    if (!publicClient) {
      updateMessage(
        prediction.id,

        "Arc Testnet client is unavailable."
      );

      return;
    }

    try {
      setProcessingPredictionId(
        prediction.id
      );

      setProcessingAction(
        "claim"
      );

      updateMessage(
        prediction.id,

        "Confirm reward claim in MetaMask."
      );

      const hash =
        await writeContractAsync(
          {
            address:
              FORECAST_REGISTRY_V2_ADDRESS,

            abi:
              FORECAST_REGISTRY_V2_ABI,

            functionName:
              "claimReward",

            args: [
              BigInt(
                prediction.forecastId
              ),
            ],

            chainId:
              arcTestnet.id,
          }
        );

      setLatestHashes(
        (
          currentHashes
        ) => ({
          ...currentHashes,

          [prediction.id]:
            hash,
        })
      );

      updateMessage(
        prediction.id,

        "Claim submitted. Waiting for Arc confirmation..."
      );

      /*
       * No 60-second hasClaimed polling.
       *
       * A successful claimReward receipt
       * means the contract call succeeded.
       */
      const receipt =
        await withTimeout(
          publicClient.waitForTransactionReceipt(
            {
              hash,

              confirmations: 1,
            }
          ),

          RECEIPT_TIMEOUT_MS,

          "Claim receipt timed out."
        );

      if (
        receipt.status !==
        "success"
      ) {
        throw new Error(
          "Claim transaction reverted."
        );
      }

      const synced =
        syncClaimedReward(
          prediction.id,
          hash
        );

      if (synced) {
        updateMessage(
          prediction.id,

          "Arena Points claimed successfully."
        );
      } else {
        updateMessage(
          prediction.id,

          "Claim confirmed onchain."
        );
      }
    } catch (error) {
      console.error(
        "Reward claim failed:",

        error
      );

      const errorText =
        getErrorText(
          error
        );

      if (
        errorText.includes(
          "already claimed"
        )
      ) {
        try {
          const hasClaimed =
            await readHasClaimed(
              prediction.forecastId
            );

          if (hasClaimed) {
            syncClaimedReward(
              prediction.id
            );

            updateMessage(
              prediction.id,

              "Previous successful claim detected. Arena balance updated."
            );

            return;
          }
        } catch {
          updateMessage(
            prediction.id,

            "Contract reports an existing claim, but Arc RPC could not confirm its status. Try Sync Claim Status."
          );

          return;
        }
      }

      if (
        errorText.includes(
          "user rejected"
        ) ||
        errorText.includes(
          "user denied"
        )
      ) {
        updateMessage(
          prediction.id,

          "Claim transaction was rejected in MetaMask."
        );

        return;
      }

      if (
        errorText.includes(
          "timed out"
        )
      ) {
        updateMessage(
          prediction.id,

          "Claim transaction may still be pending. Check Arc Explorer, then use Sync Claim Status."
        );

        return;
      }

      updateMessage(
        prediction.id,

        "Reward claim failed."
      );
    } finally {
      setProcessingPredictionId(
        null
      );

      setProcessingAction(
        null
      );
    }
  }

  /*
   * One lightweight automatic status
   * check per unclaimed winning record.
   *
   * No repeated polling.
   */
  useEffect(() => {
    if (!publicClient) {
      return;
    }

    const predictionsToSync =
      predictions.filter(
        (
          prediction
        ) =>
          prediction.status ===
            "won" &&
          !prediction.claimed &&
          Boolean(
            prediction.forecastId
          ) &&
          !autoSyncCheckedRef.current.has(
            prediction.id
          )
      );

    for (
      const prediction
      of predictionsToSync
    ) {
      autoSyncCheckedRef.current.add(
        prediction.id
      );

      void readHasClaimed(
        prediction.forecastId as string
      )
        .then(
          (
            hasClaimed
          ) => {
            if (
              hasClaimed
            ) {
              syncClaimedReward(
                prediction.id
              );
            }
          }
        )
        .catch(
          (error) => {
            console.error(
              "Automatic claim sync skipped:",

              error
            );
          }
        );
    }
  }, [
    publicClient,
    predictions,
    syncClaimedReward,
  ]);

  const totalUnclaimedRewards =
    predictions.reduce(
      (
        total,
        prediction
      ) => {
        if (
          prediction.status !==
            "won" ||
          prediction.claimed
        ) {
          return total;
        }

        const reward =
          prediction.claimableReward >
          0
            ? prediction.claimableReward
            : prediction.reward;

        return (
          total +
          reward
        );
      },
      0
    );

  const totalServerUnclaimedRewards =
    serverPredictions.reduce(
      (
        total,
        prediction
      ) => {
        if (
          prediction.status !==
            "won" ||
          prediction.claimed
        ) {
          return total;
        }

        return (
          total +
          prediction.points * 2
        );
      },
      0
    );

  return (
    <section className="rounded-3xl border border-white/10 bg-[#0d121a] p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-sm font-semibold text-orange-400">
            Prediction History
          </p>

          <h3 className="mt-2 text-2xl font-bold text-white">
            Server prediction history
          </h3>

          <p className="mt-2 text-sm text-gray-500">
            Supabase is now the
            primary source for
            accepted forecasts,
            settlement status and
            reward claims.
          </p>
        </div>

        <div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/[0.08] px-4 py-3">
          <p className="text-[10px] uppercase tracking-wider text-emerald-400">
            Unclaimed Rewards
          </p>

          <p className="mt-1 text-xl font-black text-white">
            {totalServerUnclaimedRewards.toLocaleString()}{" "}
            points
          </p>
        </div>
      </div>

      <div className="mt-6 rounded-2xl border border-purple-300/20 bg-purple-300/[0.04] p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-sm font-semibold text-purple-200">
              Your recent forecasts
            </p>

            <p className="mt-1 text-xs leading-5 text-gray-500">
              Server-backed records
              for the signed-in
              wallet. Use these for
              the current Predarc
              demo flow.
            </p>
          </div>

          <button
            type="button"
            disabled={
              isLoadingServerHistory
            }
            onClick={() => {
              void loadServerHistory();
            }}
            className="rounded-xl bg-purple-300 px-4 py-2 text-xs font-bold text-black transition hover:bg-purple-200 disabled:cursor-wait disabled:opacity-50"
          >
            {isLoadingServerHistory
              ? "Refreshing..."
              : "Refresh server records"}
          </button>
        </div>

        {serverHistoryMessage ? (
          <p className="mt-3 text-xs text-purple-100">
            {serverHistoryMessage}
          </p>
        ) : null}

        {serverPredictions.length >
        0 ? (
          <div className="mt-4 grid gap-3">
            {serverPredictions.map(
              (
                prediction
              ) => {
                const canSettleServerPrediction =
                  prediction.status ===
                    "pending" &&
                  isServerPredictionClosed(
                    prediction
                  );

                const canClaimServerPrediction =
                  prediction.status ===
                    "won" &&
                  !prediction.claimed;

                const isServerProcessing =
                  serverProcessingId ===
                  prediction.id;

                const serverRecordMessage =
                  serverRecordMessages[
                    prediction.id
                  ];

                return (
                  <div
                    key={
                      prediction.id
                    }
                    className="rounded-xl border border-white/10 bg-black/10 p-4"
                  >
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <p className="text-xs font-bold text-white">
                        {
                          prediction.market
                        }
                        /USDT ·{" "}
                        {prediction.direction.toUpperCase()}
                      </p>

                      <p className="mt-1 text-[11px] text-gray-500">
                        Accepted{" "}
                        {formatServerDate(
                          prediction.accepted_at
                        )}
                      </p>
                    </div>

                    <span className="rounded-full border border-white/10 px-3 py-1 text-[10px] font-bold uppercase text-gray-300">
                      {
                        prediction.status
                      }
                    </span>
                  </div>

                  <div className="mt-3 grid gap-3 text-xs sm:grid-cols-3">
                    <p className="text-gray-400">
                      Stake:{" "}
                      <span className="font-semibold text-white">
                        {prediction.points.toLocaleString()}{" "}
                        points
                      </span>
                    </p>

                    <p className="text-gray-400">
                      Entry:{" "}
                      <span className="font-semibold text-white">
                        $
                        {Number(
                          prediction.entry_price
                        ).toLocaleString()}
                      </span>
                    </p>

                    <p className="text-gray-400">
                      Closes:{" "}
                      <span className="font-semibold text-white">
                        {formatServerDate(
                          prediction.closes_at
                        )}
                      </span>
                    </p>
                  </div>

                  {serverRecordMessage ? (
                    <p className="mt-3 text-xs text-purple-100">
                      {
                        serverRecordMessage
                      }
                    </p>
                  ) : null}

                  {canSettleServerPrediction ? (
                    <button
                      type="button"
                      disabled={
                        isServerProcessing
                      }
                      onClick={() => {
                        void settleServerPrediction(
                          prediction
                        );
                      }}
                      className="mt-3 w-full rounded-xl bg-purple-300 px-4 py-2 text-xs font-bold uppercase text-black transition hover:bg-purple-200 disabled:cursor-wait disabled:opacity-50"
                    >
                      {isServerProcessing
                        ? "Settling..."
                        : "Settle server result"}
                    </button>
                  ) : null}

                  {canClaimServerPrediction ? (
                    <button
                      type="button"
                      disabled={
                        isServerProcessing
                      }
                      onClick={() => {
                        void claimServerPrediction(
                          prediction
                        );
                      }}
                      className="mt-3 w-full rounded-xl bg-purple-300 px-4 py-2 text-xs font-bold uppercase text-black transition hover:bg-purple-200 disabled:cursor-wait disabled:opacity-50"
                    >
                      {isServerProcessing
                        ? "Claiming..."
                        : `Claim ${(
                            prediction.points *
                            2
                          ).toLocaleString()} server points`}
                    </button>
                  ) : null}

                  {prediction.status ===
                    "won" &&
                  prediction.claimed ? (
                    <p className="mt-3 text-xs font-semibold text-emerald-300">
                      Server reward
                      claimed.
                    </p>
                  ) : null}
                </div>
                );
              }
            )}
          </div>
        ) : (
          <p className="mt-4 text-sm text-gray-500">
            No server ledger
            predictions loaded yet.
          </p>
        )}
      </div>

      {serverPredictions.length ===
        0 &&
        predictions.length ===
          0 && (
        <div className="mt-6 rounded-2xl border border-dashed border-white/10 bg-white/[0.015] p-8 text-center">
          <p className="font-semibold text-gray-300">
            No predictions yet
          </p>

          <p className="mt-2 text-sm text-gray-600">
            Submit your first
            market forecast to
            see it here.
          </p>
        </div>
      )}

      {predictions.length >
        0 && (
        <details className="mt-6 rounded-2xl border border-white/10 bg-white/[0.015] p-5">
          <summary className="flex cursor-pointer list-none flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-sm font-semibold text-gray-300">
                Legacy local demo
                history
              </p>

              <p className="mt-1 text-xs leading-5 text-gray-500">
                These older browser
                records are kept for
                reference while the
                app moves to the
                server ledger.
              </p>
            </div>

            <div className="rounded-xl border border-white/10 bg-black/10 px-3 py-2 text-right">
              <p className="text-[10px] uppercase tracking-wider text-gray-500">
                Local unclaimed
              </p>

              <p className="text-sm font-bold text-gray-200">
                {totalUnclaimedRewards.toLocaleString()}{" "}
                points
              </p>
            </div>
          </summary>

          <div className="mt-4 space-y-4">
        {predictions.map(
          (
            prediction
          ) => {
            const isWon =
              prediction.status ===
              "won";

            const isResolvedOnchain =
              Boolean(
                prediction.resolveTransactionHash
              ) ||
              prediction.onchainStatus ===
                "claimable" ||
              prediction.onchainStatus ===
                "claimed";

            const isClaimable =
              isWon &&
              isResolvedOnchain &&
              !prediction.claimed;

            const isProcessing =
              processingPredictionId ===
              prediction.id;

            const visibleHash =
              latestHashes[
                prediction.id
              ] ??
              prediction.claimTransactionHash ??
              prediction.resolveTransactionHash ??
              prediction.transactionHash;

            return (
              <article
                key={
                  prediction.id
                }
                className="relative overflow-hidden rounded-2xl border border-white/10 bg-white/[0.02] p-5"
              >
                <div className="pointer-events-none absolute -right-12 -top-12 h-32 w-32 rounded-full bg-orange-500/[0.03] blur-3xl" />

                <div className="relative">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="text-xs text-gray-500">
                          Round #
                          {
                            prediction.roundNumber
                          }
                        </p>

                        <span className="rounded-full border border-orange-500/30 bg-orange-500/10 px-2.5 py-1 text-[9px] font-black text-orange-400">
                          {
                            prediction.market
                          }
                          /USDT
                        </span>
                      </div>

                      <p
                        className={`mt-2 text-lg font-bold ${
                          prediction.direction ===
                          "higher"
                            ? "text-emerald-400"
                            : "text-rose-400"
                        }`}
                      >
                        {prediction.direction.toUpperCase()}
                      </p>
                    </div>

                    <span
                      className={`rounded-full border px-3 py-1 text-xs font-bold ${
                        prediction.claimed
                          ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-400"
                          : prediction.status ===
                              "won"
                            ? "border-emerald-500/20 text-emerald-300"
                            : prediction.status ===
                                "lost"
                              ? "border-rose-500/20 text-rose-300"
                              : "border-white/10 text-gray-300"
                      }`}
                    >
                      {prediction.claimed
                        ? "CLAIMED"
                        : prediction.status.toUpperCase()}
                    </span>
                  </div>

                  <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                    <div>
                      <p className="text-xs text-gray-500">
                        Timeframe
                      </p>

                      <p className="mt-1 font-semibold text-white">
                        {formatDuration(
                          prediction.duration
                        )}
                      </p>
                    </div>

                    <div>
                      <p className="text-xs text-gray-500">
                        Stake
                      </p>

                      <p className="mt-1 font-semibold text-white">
                        {prediction.points.toLocaleString()}{" "}
                        points
                      </p>
                    </div>

                    <div>
                      <p className="text-xs text-gray-500">
                        Start / End
                      </p>

                      <p className="mt-1 text-xs font-medium text-white">
                        {formatPrice(
                          prediction.startPrice,
                          prediction.market
                        )}{" "}
                        →{" "}
                        {formatPrice(
                          prediction.endPrice,
                          prediction.market
                        )}
                      </p>
                    </div>

                    <div>
                      <p className="text-xs text-gray-500">
                        Movement
                      </p>

                      <p
                        className={`mt-1 font-semibold ${
                          prediction.priceDifference !==
                            null &&
                          prediction.priceDifference >=
                            0
                            ? "text-emerald-300"
                            : "text-rose-300"
                        }`}
                      >
                        {formatDifference(
                          prediction.priceDifference,
                          prediction.market
                        )}
                      </p>
                    </div>
                  </div>

                  {isWon && (
                    <div className="mt-4 rounded-xl border border-emerald-500/25 bg-emerald-500/[0.06] p-4">
                      <p className="font-bold text-emerald-400">
                        {prediction.reward.toLocaleString()}{" "}
                        Arena Points
                      </p>

                      {!prediction.claimed &&
                        !isResolvedOnchain && (
                          <button
                            type="button"
                            disabled={
                              isWaitingForWallet ||
                              isProcessing
                            }
                            onClick={() => {
                              void resolvePredictionOnchain(
                                prediction
                              );
                            }}
                            className="mt-3 w-full rounded-xl border border-yellow-500/25 bg-yellow-500/15 px-4 py-3 text-xs font-black text-yellow-300 transition hover:bg-yellow-500/20 disabled:cursor-wait disabled:opacity-50"
                          >
                            {isProcessing &&
                            processingAction ===
                              "resolve"
                              ? "RESOLVING..."
                              : "RESOLVE REWARD ONCHAIN"}
                          </button>
                        )}

                      {isClaimable && (
                        <button
                          type="button"
                          disabled={
                            isWaitingForWallet ||
                            isProcessing
                          }
                          onClick={() => {
                            void claimPredictionReward(
                              prediction
                            );
                          }}
                          className="mt-3 w-full rounded-xl bg-emerald-500 px-4 py-3 text-xs font-black text-black transition hover:bg-emerald-400 disabled:cursor-wait disabled:opacity-50"
                        >
                          {isProcessing &&
                          processingAction ===
                            "claim"
                            ? "CLAIMING..."
                            : `CLAIM ${prediction.reward.toLocaleString()} POINTS ONCHAIN`}
                        </button>
                      )}

                      {!prediction.claimed &&
                        prediction.forecastId && (
                          <button
                            type="button"
                            disabled={
                              isProcessing
                            }
                            onClick={() => {
                              void syncPredictionClaim(
                                prediction
                              );
                            }}
                            className="mt-2 w-full rounded-xl border border-blue-500/30 bg-blue-500/[0.04] px-4 py-2 text-xs font-semibold text-blue-300 transition hover:bg-blue-500/[0.08] disabled:cursor-wait disabled:opacity-50"
                          >
                            {isProcessing &&
                            processingAction ===
                              "sync"
                              ? "SYNCING..."
                              : "SYNC CLAIM STATUS"}
                          </button>
                        )}

                      {prediction.claimed && (
                        <div className="mt-3 flex items-center gap-2">
                          <span className="flex h-5 w-5 items-center justify-center rounded-full bg-emerald-500/15 text-xs text-emerald-400">
                            ✓
                          </span>

                          <p className="text-sm font-bold text-emerald-400">
                            Reward claimed
                            onchain
                          </p>
                        </div>
                      )}
                    </div>
                  )}

                  {messages[
                    prediction.id
                  ] && (
                    <p className="mt-3 rounded-xl border border-blue-500/20 bg-blue-500/[0.06] p-3 text-xs leading-5 text-blue-200">
                      {
                        messages[
                          prediction.id
                        ]
                      }
                    </p>
                  )}

                  {visibleHash && (
                    <a
                      href={`https://testnet.arcscan.app/tx/${visibleHash}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="mt-3 inline-flex text-xs font-semibold text-blue-300 transition hover:text-blue-200"
                    >
                      {shortenHash(
                        visibleHash
                      )}{" "}
                      — View on Arc
                      Explorer ↗
                    </a>
                  )}
                </div>
              </article>
            );
          }
        )}
          </div>
        </details>
      )}
    </section>
  );
}






