"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";

export type PredictionDirection =
  | "higher"
  | "lower";

export type PredictionStatus =
  | "pending"
  | "won"
  | "lost";

export type PredictionDuration =
  | 60
  | 300
  | 900;

export type PredictionMarket =
  | "BTC"
  | "ETH"
  | "SOL"
  | "BNB"
  | "XRP";

export type PredictionOnchainStatus =
  | "local"
  | "submitted"
  | "resolved"
  | "claimable"
  | "claimed";

export type PredictionRecord = {
  id: number;

  roundNumber: number;

  /*
   * The asset this forecast belongs to.
   */
  market: PredictionMarket;

  direction: PredictionDirection;

  duration:
    | PredictionDuration
    | null;

  points: number;

  submittedAt: string;

  status: PredictionStatus;

  result:
    | PredictionDirection
    | null;

  reward: number;

  claimableReward: number;

  claimed: boolean;

  startPrice:
    | number
    | null;

  endPrice:
    | number
    | null;

  priceDifference:
    | number
    | null;

  forecastId:
    | string
    | null;

  transactionHash:
    | `0x${string}`
    | null;

  resolveTransactionHash:
    | `0x${string}`
    | null;

  claimTransactionHash:
    | `0x${string}`
    | null;

  onchainStatus:
    PredictionOnchainStatus;
};

type AddPredictionOnchainData = {
  forecastId?:
    | bigint
    | string;

  transactionHash?:
    `0x${string}`;
};

type DemoPointsContextValue = {
  balance: number;

  predictions:
    PredictionRecord[];

  spendPoints: (
    amount: number
  ) => boolean;

  /*
   * Market is intentionally the LAST
   * argument so existing calls continue
   * working until we update PredictionPanel.
   */
  addPrediction: (
    roundNumber: number,
    direction: PredictionDirection,
    points: number,
    duration: PredictionDuration,
    onchainData?: AddPredictionOnchainData,
    market?: PredictionMarket
  ) => number;

  /*
   * Market is optional temporarily for
   * backward compatibility.
   *
   * Later RoundProvider will pass the
   * selected market explicitly.
   */
  settleRound: (
    roundNumber: number,
    result: PredictionDirection,
    startPrice: number,
    endPrice: number,
    market?: PredictionMarket
  ) => void;

  setResolveTransaction: (
    predictionId: number,
    transactionHash:
      `0x${string}`
  ) => void;

  markResolvedOnchain: (
    predictionId: number
  ) => void;

  syncClaimedReward: (
    predictionId: number,
    transactionHash?:
      `0x${string}`
  ) => boolean;

  claimRewardLocally: (
    predictionId: number,
    transactionHash:
      `0x${string}`
  ) => boolean;

  addPoints: (
    amount: number
  ) => void;

  resetPoints: () => void;
};

type SavedDemoData = {
  balance: number;

  predictions:
    PredictionRecord[];
};

type DemoPointsProviderProps = {
  children: ReactNode;
};

const STARTING_POINTS = 1000;

const STORAGE_KEY =
  "prederc-forecast-arena-v2-data";

const DemoPointsContext =
  createContext<
    DemoPointsContextValue | null
  >(null);

function normalizeMarket(
  market: unknown
): PredictionMarket {
  if (
    market === "BTC" ||
    market === "ETH" ||
    market === "SOL" ||
    market === "BNB" ||
    market === "XRP"
  ) {
    return market;
  }

  /*
   * Existing predictions were created
   * before multi-market support.
   *
   * They were all BTC forecasts.
   */
  return "BTC";
}

function normalizeDuration(
  duration: unknown
):
  | PredictionDuration
  | null {
  if (
    duration === 60 ||
    duration === 300 ||
    duration === 900
  ) {
    return duration;
  }

  return null;
}

function normalizeHash(
  value: unknown
):
  | `0x${string}`
  | null {
  if (
    typeof value ===
      "string" &&
    value.startsWith("0x")
  ) {
    return value as
      `0x${string}`;
  }

  return null;
}

function normalizeStatus(
  status: unknown
): PredictionStatus {
  if (
    status === "pending" ||
    status === "won" ||
    status === "lost"
  ) {
    return status;
  }

  return "pending";
}

function normalizeResult(
  result: unknown
):
  | PredictionDirection
  | null {
  if (
    result === "higher" ||
    result === "lower"
  ) {
    return result;
  }

  return null;
}

function normalizeOnchainStatus(
  value: unknown,
  status: PredictionStatus,
  claimed: boolean,
  resolveTransactionHash:
    | `0x${string}`
    | null
): PredictionOnchainStatus {
  if (claimed) {
    return "claimed";
  }

  if (
    status === "won" &&
    (
      resolveTransactionHash !==
        null ||
      value === "claimable"
    )
  ) {
    return "claimable";
  }

  if (
    status === "lost"
  ) {
    return "resolved";
  }

  if (
    value === "local" ||
    value === "submitted" ||
    value === "resolved" ||
    value === "claimable" ||
    value === "claimed"
  ) {
    return value;
  }

  return "local";
}

function normalizePrediction(
  prediction:
    Partial<PredictionRecord>
):
  | PredictionRecord
  | null {
  if (
    typeof prediction.id !==
      "number" ||
    !Number.isFinite(
      prediction.id
    ) ||
    typeof prediction.roundNumber !==
      "number" ||
    !Number.isFinite(
      prediction.roundNumber
    ) ||
    typeof prediction.points !==
      "number" ||
    !Number.isFinite(
      prediction.points
    ) ||
    (
      prediction.direction !==
        "higher" &&
      prediction.direction !==
        "lower"
    )
  ) {
    return null;
  }

  const direction:
    PredictionDirection =
      prediction.direction;

  const market =
    normalizeMarket(
      prediction.market
    );

  const status =
    normalizeStatus(
      prediction.status
    );

  const result =
    normalizeResult(
      prediction.result
    );

  const reward =
    typeof prediction.reward ===
      "number" &&
    Number.isFinite(
      prediction.reward
    )
      ? prediction.reward
      : 0;

  const claimableReward =
    typeof prediction.claimableReward ===
      "number" &&
    Number.isFinite(
      prediction.claimableReward
    )
      ? prediction.claimableReward
      : status === "won"
        ? reward
        : 0;

  const claimed =
    prediction.claimed === true;

  const resolveTransactionHash =
    normalizeHash(
      prediction.resolveTransactionHash
    );

  return {
    id:
      prediction.id,

    roundNumber:
      prediction.roundNumber,

    market,

    direction,

    duration:
      normalizeDuration(
        prediction.duration
      ),

    points:
      prediction.points,

    submittedAt:
      typeof prediction.submittedAt ===
        "string"
        ? prediction.submittedAt
        : "Unknown",

    status,

    result,

    reward,

    claimableReward,

    claimed,

    startPrice:
      typeof prediction.startPrice ===
        "number" &&
      Number.isFinite(
        prediction.startPrice
      )
        ? prediction.startPrice
        : null,

    endPrice:
      typeof prediction.endPrice ===
        "number" &&
      Number.isFinite(
        prediction.endPrice
      )
        ? prediction.endPrice
        : null,

    priceDifference:
      typeof prediction.priceDifference ===
        "number" &&
      Number.isFinite(
        prediction.priceDifference
      )
        ? prediction.priceDifference
        : null,

    forecastId:
      typeof prediction.forecastId ===
        "string"
        ? prediction.forecastId
        : null,

    transactionHash:
      normalizeHash(
        prediction.transactionHash
      ),

    resolveTransactionHash,

    claimTransactionHash:
      normalizeHash(
        prediction.claimTransactionHash
      ),

    onchainStatus:
      normalizeOnchainStatus(
        prediction.onchainStatus,
        status,
        claimed,
        resolveTransactionHash
      ),
  };
}

export function DemoPointsProvider({
  children,
}: DemoPointsProviderProps) {
  const [
    balance,
    setBalance,
  ] = useState(
    STARTING_POINTS
  );

  const [
    predictions,
    setPredictions,
  ] = useState<
    PredictionRecord[]
  >([]);

  const [
    hasLoadedStorage,
    setHasLoadedStorage,
  ] = useState(false);

  const balanceRef =
    useRef(
      STARTING_POINTS
    );

  const predictionsRef =
    useRef<
      PredictionRecord[]
    >([]);

  const updateBalance =
    useCallback(
      (
        nextBalance: number
      ): void => {
        balanceRef.current =
          nextBalance;

        setBalance(
          nextBalance
        );
      },
      []
    );

  const updatePredictions =
    useCallback(
      (
        nextPredictions:
          PredictionRecord[]
      ): void => {
        predictionsRef.current =
          nextPredictions;

        setPredictions(
          nextPredictions
        );
      },
      []
    );

  /*
   * Restore saved Arena data.
   *
   * Older BTC-only records are automatically
   * migrated to market: "BTC".
   */
  useEffect(() => {
    try {
      const savedData =
        window.localStorage.getItem(
          STORAGE_KEY
        );

      if (!savedData) {
        return;
      }

      const parsedData =
        JSON.parse(
          savedData
        ) as SavedDemoData;

      if (
        !Number.isFinite(
          parsedData.balance
        ) ||
        !Array.isArray(
          parsedData.predictions
        )
      ) {
        return;
      }

      const normalizedPredictions =
        parsedData.predictions
          .map(
            normalizePrediction
          )
          .filter(
            (
              prediction
            ):
              prediction is
                PredictionRecord =>
              prediction !==
              null
          );

      balanceRef.current =
        parsedData.balance;

      predictionsRef.current =
        normalizedPredictions;

      setBalance(
        parsedData.balance
      );

      setPredictions(
        normalizedPredictions
      );
    } catch (error) {
      console.error(
        "Could not load Arena data:",
        error
      );
    } finally {
      setHasLoadedStorage(
        true
      );
    }
  }, []);

  /*
   * Sync the server ledger balance into the active prediction balance.
   */
  useEffect(() => {
    if (!hasLoadedStorage) {
      return;
    }

    let cancelled = false;

    async function syncServerBalance() {
      try {
        const response = await fetch("/api/account", {
          method: "POST",
          credentials: "include",
          cache: "no-store",
        });

        const result = await response.json();
        const nextBalance = Number(
          result?.points ?? result?.balance
        );

        if (
          !cancelled &&
          result?.authenticated === true &&
          Number.isSafeInteger(nextBalance) &&
          nextBalance >= 0
        ) {
          updateBalance(nextBalance);
        }
      } catch {
        // Keep the local balance if the server is unavailable.
      }
    }

    void syncServerBalance();

    function refreshServerBalance() {
      void syncServerBalance();
    }

    window.addEventListener(
      "predarc:server-balance",
      refreshServerBalance
    );

    return () => {
      cancelled = true;
      window.removeEventListener(
        "predarc:server-balance",
        refreshServerBalance
      );
    };
  }, [hasLoadedStorage, updateBalance]);

  /*
   * Persist predictions and balance.
   */
  useEffect(() => {
    if (
      !hasLoadedStorage
    ) {
      return;
    }

    const savedData:
      SavedDemoData = {
      balance,
      predictions,
    };

    try {
      window.localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify(
          savedData
        )
      );
    } catch (error) {
      console.error(
        "Could not save Arena data:",
        error
      );
    }
  }, [
    balance,
    predictions,
    hasLoadedStorage,
  ]);

  const spendPoints =
    useCallback(
      (
        amount: number
      ): boolean => {
        const currentBalance =
          balanceRef.current;

        if (
          !Number.isFinite(
            amount
          ) ||
          amount <= 0 ||
          amount >
            currentBalance
        ) {
          return false;
        }

        updateBalance(
          currentBalance -
            amount
        );

        return true;
      },
      [
        updateBalance,
      ]
    );

  const addPrediction =
    useCallback(
      (
        roundNumber: number,
        direction:
          PredictionDirection,
        points: number,
        duration:
          PredictionDuration,
        onchainData?:
          AddPredictionOnchainData,
        market:
          PredictionMarket =
          "BTC"
      ): number => {
        const predictionId =
          Date.now();

        const transactionHash =
          onchainData
            ?.transactionHash ??
          null;

        const newPrediction:
          PredictionRecord = {
          id:
            predictionId,

          roundNumber,

          market,

          direction,

          duration,

          points,

          submittedAt:
            new Date()
              .toLocaleTimeString(
                [],
                {
                  hour:
                    "2-digit",

                  minute:
                    "2-digit",

                  second:
                    "2-digit",
                }
              ),

          status:
            "pending",

          result:
            null,

          reward:
            0,

          claimableReward:
            0,

          claimed:
            false,

          startPrice:
            null,

          endPrice:
            null,

          priceDifference:
            null,

          forecastId:
            onchainData
              ?.forecastId !==
            undefined
              ? onchainData.forecastId.toString()
              : null,

          transactionHash,

          resolveTransactionHash:
            null,

          claimTransactionHash:
            null,

          onchainStatus:
            transactionHash
              ? "submitted"
              : "local",
        };

        updatePredictions([
          newPrediction,
          ...predictionsRef.current,
        ]);

        return predictionId;
      },
      [
        updatePredictions,
      ]
    );

  /*
   * Resolve predictions for a specific round.
   *
   * Once RoundProvider passes a market,
   * only predictions belonging to that
   * asset will resolve.
   *
   * The optional market preserves existing
   * behaviour until we update RoundProvider.
   */
  const settleRound =
    useCallback(
      (
        roundNumber: number,
        result:
          PredictionDirection,
        startPrice: number,
        endPrice: number,
        market?:
          PredictionMarket
      ): void => {
        if (
          !Number.isFinite(
            startPrice
          ) ||
          !Number.isFinite(
            endPrice
          )
        ) {
          return;
        }

        const priceDifference =
          endPrice -
          startPrice;

        const nextPredictions:
          PredictionRecord[] =
          predictionsRef.current.map(
            (
              prediction
            ):
              PredictionRecord => {
              const matchesRound =
                prediction.roundNumber ===
                roundNumber;

              const matchesMarket =
                market ===
                  undefined ||
                prediction.market ===
                  market;

              if (
                !matchesRound ||
                !matchesMarket ||
                prediction.status !==
                  "pending"
              ) {
                return prediction;
              }

              const didWin =
                prediction.direction ===
                result;

              const reward =
                didWin
                  ? prediction.points *
                    2
                  : 0;

              const nextStatus:
                PredictionStatus =
                didWin
                  ? "won"
                  : "lost";

              const nextOnchainStatus:
                PredictionOnchainStatus =
                didWin
                  ? "submitted"
                  : "resolved";

              return {
                ...prediction,

                status:
                  nextStatus,

                result,

                reward,

                claimableReward:
                  reward,

                claimed:
                  false,

                startPrice,

                endPrice,

                priceDifference,

                onchainStatus:
                  nextOnchainStatus,
              };
            }
          );

        updatePredictions(
          nextPredictions
        );
      },
      [
        updatePredictions,
      ]
    );

  const setResolveTransaction =
    useCallback(
      (
        predictionId: number,
        transactionHash:
          `0x${string}`
      ): void => {
        const nextPredictions:
          PredictionRecord[] =
          predictionsRef.current.map(
            (
              prediction
            ):
              PredictionRecord => {
              if (
                prediction.id !==
                predictionId
              ) {
                return prediction;
              }

              const nextOnchainStatus:
                PredictionOnchainStatus =
                prediction.status ===
                  "won"
                  ? "claimable"
                  : "resolved";

              return {
                ...prediction,

                resolveTransactionHash:
                  transactionHash,

                onchainStatus:
                  nextOnchainStatus,
              };
            }
          );

        updatePredictions(
          nextPredictions
        );
      },
      [
        updatePredictions,
      ]
    );

  const markResolvedOnchain =
    useCallback(
      (
        predictionId: number
      ): void => {
        const nextPredictions:
          PredictionRecord[] =
          predictionsRef.current.map(
            (
              prediction
            ):
              PredictionRecord => {
              if (
                prediction.id !==
                predictionId
              ) {
                return prediction;
              }

              const nextOnchainStatus:
                PredictionOnchainStatus =
                prediction.status ===
                  "won"
                  ? "claimable"
                  : "resolved";

              return {
                ...prediction,

                onchainStatus:
                  nextOnchainStatus,
              };
            }
          );

        updatePredictions(
          nextPredictions
        );
      },
      [
        updatePredictions,
      ]
    );

  const syncClaimedReward =
    useCallback(
      (
        predictionId: number,
        transactionHash?:
          `0x${string}`
      ): boolean => {
        const targetPrediction =
          predictionsRef.current.find(
            (
              prediction
            ) =>
              prediction.id ===
              predictionId
          );

        if (
          !targetPrediction ||
          targetPrediction.status !==
            "won" ||
          targetPrediction.claimed
        ) {
          return false;
        }

        const rewardToAdd =
          targetPrediction
            .claimableReward >
          0
            ? targetPrediction.claimableReward
            : targetPrediction.reward;

        if (
          !Number.isFinite(
            rewardToAdd
          ) ||
          rewardToAdd <= 0
        ) {
          return false;
        }

        const nextPredictions:
          PredictionRecord[] =
          predictionsRef.current.map(
            (
              prediction
            ):
              PredictionRecord => {
              if (
                prediction.id !==
                predictionId
              ) {
                return prediction;
              }

              return {
                ...prediction,

                claimed:
                  true,

                claimableReward:
                  0,

                claimTransactionHash:
                  transactionHash ??
                  prediction.claimTransactionHash,

                onchainStatus:
                  "claimed",
              };
            }
          );

        const nextBalance =
          balanceRef.current +
          rewardToAdd;

        /*
         * Update refs first so repeated
         * sync calls cannot add the same
         * reward twice.
         */
        predictionsRef.current =
          nextPredictions;

        balanceRef.current =
          nextBalance;

        setPredictions(
          nextPredictions
        );

        setBalance(
          nextBalance
        );

        return true;
      },
      []
    );

  const claimRewardLocally =
    useCallback(
      (
        predictionId: number,
        transactionHash:
          `0x${string}`
      ): boolean => {
        return syncClaimedReward(
          predictionId,
          transactionHash
        );
      },
      [
        syncClaimedReward,
      ]
    );

  const addPoints =
    useCallback(
      (
        amount: number
      ): void => {
        if (
          !Number.isFinite(
            amount
          ) ||
          amount <= 0
        ) {
          return;
        }

        updateBalance(
          balanceRef.current +
            amount
        );
      },
      [
        updateBalance,
      ]
    );

  const resetPoints =
    useCallback(
      (): void => {
        balanceRef.current =
          STARTING_POINTS;

        predictionsRef.current =
          [];

        setBalance(
          STARTING_POINTS
        );

        setPredictions(
          []
        );

        try {
          window.localStorage.removeItem(
            STORAGE_KEY
          );
        } catch (error) {
          console.error(
            "Could not clear Arena data:",
            error
          );
        }
      },
      []
    );

  const value =
    useMemo<
      DemoPointsContextValue
    >(
      () => ({
        balance,

        predictions,

        spendPoints,

        addPrediction,

        settleRound,

        setResolveTransaction,

        markResolvedOnchain,

        syncClaimedReward,

        claimRewardLocally,

        addPoints,

        resetPoints,
      }),
      [
        balance,

        predictions,

        spendPoints,

        addPrediction,

        settleRound,

        setResolveTransaction,

        markResolvedOnchain,

        syncClaimedReward,

        claimRewardLocally,

        addPoints,

        resetPoints,
      ]
    );

  return (
    <DemoPointsContext.Provider
      value={value}
    >
      {children}
    </DemoPointsContext.Provider>
  );
}

export function useDemoPoints():
  DemoPointsContextValue {
  const context =
    useContext(
      DemoPointsContext
    );

  if (!context) {
    throw new Error(
      "useDemoPoints must be used inside DemoPointsProvider."
    );
  }

  return context;
}


