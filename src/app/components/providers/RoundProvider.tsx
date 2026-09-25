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

import {
  useDemoPoints,
  type PredictionMarket,
} from "./DemoPointsProvider";

import {
  useBtcPrice,
  type BtcTimeframe,
} from "./BtcPriceProvider";

export type RoundDirection =
  | "higher"
  | "lower";

export type RoundStatus =
  | "open"
  | "resolving"
  | "result";

export type PredictionDuration =
  | 60
  | 300
  | 900
  | 3600;

type RoundContextValue = {
  roundNumber: number;

  timeLeft: number;

  status: RoundStatus;

  result:
    | RoundDirection
    | null;

  progress: number;

  isPredictionOpen: boolean;

  startPrice:
    | number
    | null;

  endPrice:
    | number
    | null;

  /*
   * Asset currently attached
   * to this prediction round.
   */
  roundMarket:
    PredictionMarket;

  /*
   * Market switching will later
   * be disabled in MarketSelector
   * while a prediction is active.
   */
  canChangeMarket: boolean;

  roundDuration:
    PredictionDuration;

  setPredictionDuration: (
    duration:
      PredictionDuration
  ) => void;

  canChangeDuration: boolean;
};

type RoundProviderProps = {
  children: ReactNode;
};

const DEFAULT_ROUND_DURATION:
  PredictionDuration = 60;

const RESOLVING_DURATION = 0;

const RESULT_DURATION = 0;

function getNextBoundaryTimestamp(
  duration: PredictionDuration
): number {
  const durationMs =
    duration * 1000;

  const now =
    Date.now();

  return (
    Math.floor(
      now / durationMs
    ) *
      durationMs +
    durationMs
  );
}

function getRemainingSeconds(
  endsAt: number
): number {
  return Math.max(
    0,
    Math.ceil(
      (endsAt - Date.now()) /
        1000
    )
  );
}

function durationForTimeframe(
  value: BtcTimeframe
): PredictionDuration {
  return value === "1m"
    ? 60
    : value === "5m"
      ? 300
      : value === "15m"
        ? 900
        : 3600;
}
const RoundContext =
  createContext<
    RoundContextValue | null
  >(null);

export function RoundProvider({
  children,
}: RoundProviderProps) {
  const {
    settleRound,
    predictions,
  } = useDemoPoints();

  const {
    data,
    candles,
    timeframe,
    isConnected,
    selectedMarket,
  } = useBtcPrice();

  const [
    roundNumber,
    setRoundNumber,
  ] =
    useState(1);

  const [
    roundMarket,
    setRoundMarket,
  ] =
    useState<PredictionMarket>(
      selectedMarket
    );

  const [
    roundDuration,
    setRoundDuration,
  ] =
    useState<PredictionDuration>(
      DEFAULT_ROUND_DURATION
    );

  const [
    timeLeft,
    setTimeLeft,
  ] =
    useState<number>(
      DEFAULT_ROUND_DURATION
    );

  const [
    status,
    setStatus,
  ] =
    useState<RoundStatus>(
      "open"
    );

  const [
    result,
    setResult,
  ] =
    useState<
      RoundDirection | null
    >(null);

  const [
    startPrice,
    setStartPrice,
  ] =
    useState<
      number | null
    >(null);

  const [
    endPrice,
    setEndPrice,
  ] =
    useState<
      number | null
    >(null);

  /*
   * Latest live market price.
   */
  const latestPriceRef =
    useRef<
      number | null
    >(null);

  /*
   * Tells us which asset
   * latestPriceRef belongs to.
   */
  const latestPriceMarketRef =
    useRef<
      PredictionMarket | null
    >(null);

  /*
   * Price captured when the
   * current round begins.
   */
  const startPriceRef =
    useRef<
      number | null
    >(null);

  /*
   * Asset attached to the
   * captured start price.
   */
  const startPriceMarketRef =
    useRef<
      PredictionMarket | null
    >(null);

  /*
   * Prevents a round from being
   * settled more than once.
   */
  const settledRoundRef =
    useRef<
      number | null
    >(null);

  /*
   * Exact wall-clock boundary for the
   * currently active Binance-style round.
   */
  const roundEndsAtRef =
    useRef<
      number | null
    >(null);

  /*
   * Price captured exactly when the
   * current candle/round reaches its
   * time boundary.
   */
  const roundClosingPriceRef =
    useRef<
      number | null
    >(null);

  /*
   * The previous candle close becomes
   * the reference opening price for the
   * next synchronized round.
   */
  const nextRoundStartPriceRef =
    useRef<
      number | null
    >(null);

  /*
   * Find a pending prediction
   * for this exact round.
   */
  const currentRoundPrediction =
    predictions.find(
      (prediction) =>
        prediction.roundNumber ===
          roundNumber &&
        prediction.duration ===
          roundDuration &&
        prediction.status ===
          "pending"
    );

  const hasCurrentRoundPrediction =
    Boolean(
      currentRoundPrediction
    );

  const chartDuration =
    durationForTimeframe(
      timeframe
    );

  const chartDurationPrediction =
    predictions.find(
      (prediction) =>
        prediction.duration ===
          chartDuration &&
        prediction.status ===
          "pending"
    );

  useEffect(() => {
    if (
      chartDurationPrediction ||
      roundDuration === chartDuration
    ) {
      return;
    }

    const currentPrice =
      latestPriceMarketRef.current ===
        selectedMarket
        ? latestPriceRef.current
        : null;

    setRoundDuration(chartDuration);
    setStatus("open");
    setResult(null);
    setEndPrice(null);
    setStartPrice(currentPrice);

    startPriceRef.current =
      currentPrice;

    startPriceMarketRef.current =
      currentPrice !== null
        ? selectedMarket
        : null;

    settledRoundRef.current =
      null;

    const nextBoundary =
      getNextBoundaryTimestamp(
        chartDuration
      );

    roundEndsAtRef.current =
      nextBoundary;

    setTimeLeft(
      getRemainingSeconds(
        nextBoundary
      )
    );
  }, [
    chartDuration,
    chartDurationPrediction,
    roundDuration,
    selectedMarket,
  ]);

  const canChangeDuration =
    status === "open" &&
    !hasCurrentRoundPrediction;

  const canChangeMarket =
    status === "open" &&
    !hasCurrentRoundPrediction;

  /*
   * Keep latest live price together
   * with the market it belongs to.
   *
   * This is extremely important:
   * SOL price can never accidentally
   * be treated as BTC/BNB/etc.
   */
  useEffect(() => {
    if (
      !data ||
      !Number.isFinite(
        data.price
      )
    ) {
      return;
    }

    latestPriceRef.current =
      data.price;

    latestPriceMarketRef.current =
      selectedMarket;
  }, [
    data,
    selectedMarket,
  ]);

  /*
   * When there is already an active
   * prediction, the round belongs to
   * the market saved with that prediction.
   */
  useEffect(() => {
    if (
      !currentRoundPrediction
    ) {
      return;
    }

    if (
      roundMarket !==
      currentRoundPrediction.market
    ) {
      setRoundMarket(
        currentRoundPrediction.market
      );
    }
  }, [
    currentRoundPrediction,
    roundMarket,
  ]);

  /*
   * User can freely switch markets
   * BEFORE submitting a prediction.
   *
   * Market change starts a fresh round
   * entry price and countdown.
   */
  useEffect(() => {
    if (
      status !== "open" ||
      hasCurrentRoundPrediction ||
      selectedMarket ===
        roundMarket
    ) {
      return;
    }

    setRoundMarket(
      selectedMarket
    );

    /*
     * Clear previous market's
     * entry price.
     */
    startPriceRef.current =
      null;

    startPriceMarketRef.current =
      null;

    settledRoundRef.current =
      null;

    setStartPrice(
      null
    );

    setEndPrice(
      null
    );

    setResult(
      null
    );

    /*
     * Give the newly selected
     * market a fresh full round.
     */
    setTimeLeft(
      roundDuration
    );
  }, [
    selectedMarket,
    roundMarket,
    status,
    hasCurrentRoundPrediction,
    roundDuration,
  ]);

  /*
   * Capture the start price only
   * when the live data belongs to
   * the same asset as this round.
   */
  useEffect(() => {
    if (
      status !== "open" ||
      startPriceRef.current !==
        null ||
      !isConnected ||
      selectedMarket !==
        roundMarket ||
      latestPriceMarketRef.current !==
        roundMarket ||
      latestPriceRef.current ===
        null
    ) {
      return;
    }

    const openingPrice =
      latestPriceRef.current;

    startPriceRef.current =
      openingPrice;

    startPriceMarketRef.current =
      roundMarket;

    setStartPrice(
      openingPrice
    );
  }, [
    status,
    roundNumber,
    roundMarket,
    selectedMarket,
    data,
    isConnected,
  ]);

  /*
   * Change prediction timeframe.
   *
   * Only allowed before a prediction
   * has been submitted for this round.
   */
  const setPredictionDuration =
    useCallback(
      (
        duration:
          PredictionDuration
      ): void => {
        if (
          status !== "open" ||
          hasCurrentRoundPrediction ||
          ![
            60,
            300,
            900,
            3600,
          ].includes(
            duration
          )
        ) {
          return;
        }

        setRoundDuration(
          duration
        );

        setTimeLeft(
          duration
        );

        /*
         * Restart the round using
         * the current asset price,
         * but only when that price
         * belongs to roundMarket.
         */
        const priceMatchesMarket =
          latestPriceMarketRef.current ===
          roundMarket;

        const currentPrice =
          priceMatchesMarket
            ? latestPriceRef.current
            : null;

        startPriceRef.current =
          currentPrice;

        startPriceMarketRef.current =
          currentPrice !==
          null
            ? roundMarket
            : null;

        setStartPrice(
          currentPrice
        );

        setEndPrice(
          null
        );

        setResult(
          null
        );

        settledRoundRef.current =
          null;
      },
      [
        status,
        hasCurrentRoundPrediction,
        roundMarket,
      ]
    );

  /*
   * Countdown.
   *
   * Open rounds follow absolute
   * Binance candle boundaries.
   *
   * Resolving/result phases keep
   * their short UI countdowns.
   */
  useEffect(() => {
    const intervalMs =
      status === "open"
        ? 250
        : 1000;

    const timer =
      window.setInterval(
        () => {
          if (
            status === "open"
          ) {
            if (
              roundEndsAtRef.current ===
              null
            ) {
              const nextBoundary =
                getNextBoundaryTimestamp(
                  roundDuration
                );

              roundEndsAtRef.current =
                nextBoundary;
            }

            setTimeLeft(
              getRemainingSeconds(
                roundEndsAtRef.current
              )
            );

            return;
          }

          setTimeLeft(
            (
              currentTime
            ) =>
              currentTime > 0
                ? currentTime - 1
                : 0
          );
        },
        intervalMs
      );

    return () => {
      window.clearInterval(
        timer
      );
    };
  }, [
    status,
    roundDuration,
  ]);

  /*
   * Binance candle synchronized round settlement.
   *
   * The wall-clock timer only tells us that the
   * boundary has been reached.
   *
   * Settlement waits for Binance to publish the
   * NEW candle. At that moment the previous candle
   * is finalized and its close is safe to use.
   *
   * The next round then starts immediately from
   * the new candle's opening price.
   */
  useEffect(() => {
    if (
      timeLeft !== 0
    ) {
      return;
    }

    /*
     * Boundary reached.
     *
     * Move into a very short resolving state while
     * waiting for Binance's new candle event.
     */
    if (
      status === "open"
    ) {
      setStatus(
        "resolving"
      );

      return;
    }

    if (
      status !== "resolving"
    ) {
      return;
    }

    if (
      settledRoundRef.current ===
      roundNumber
    ) {
      return;
    }

    const expectedTimeframe =
      roundDuration === 60
        ? "1m"
        : roundDuration === 300
          ? "5m"
          : roundDuration === 3600
          ? "1h"
          : "15m";

    /*
     * Never resolve a 1-minute prediction using
     * a 5m/15m chart candle, or vice versa.
     */
    if (
      timeframe !==
      expectedTimeframe
    ) {
      return;
    }

    if (
      candles.length < 2
    ) {
      return;
    }

    const latestCandle =
      candles[
        candles.length - 1
      ];

    const closedCandle =
      candles[
        candles.length - 2
      ];

    if (
      !latestCandle ||
      !closedCandle
    ) {
      return;
    }

    const boundaryTimestamp =
      roundEndsAtRef.current;

    if (
      boundaryTimestamp ===
      null
    ) {
      return;
    }

    const boundarySeconds =
      Math.floor(
        boundaryTimestamp /
          1000
      );

    /*
     * Until the newest Binance candle starts at
     * the boundary, the previous candle is not yet
     * considered finalized for this round.
     *
     * IMPORTANT:
     * We do NOT set timeLeft back to 1 here.
     * The candles dependency will trigger this
     * effect immediately when Binance sends the
     * new candle.
     */
    if (
      latestCandle.time <
      boundarySeconds
    ) {
      return;
    }

    const openingPrice =
      startPriceRef.current;

    const closingPrice =
      closedCandle.close;

    const nextOpeningPrice =
      latestCandle.open;

    const correctLiveMarket =
      latestPriceMarketRef.current ===
      roundMarket;

    const correctStartMarket =
      startPriceMarketRef.current ===
      roundMarket;

    if (
      openingPrice === null ||
      !Number.isFinite(
        openingPrice
      ) ||
      !Number.isFinite(
        closingPrice
      ) ||
      !Number.isFinite(
        nextOpeningPrice
      ) ||
      !isConnected ||
      !correctLiveMarket ||
      !correctStartMarket ||
      selectedMarket !==
        roundMarket
    ) {
      return;
    }

    /*
     * A genuinely flat finalized candle is a real
     * tie and should later be handled as DRAW/VOID.
     *
     * Do not replace it with a future live price.
     */
    if (
      closingPrice ===
      openingPrice
    ) {
      /*
       * Flat finalized candle.
       *
       * Do not leave the round stuck in RESOLVING.
       * Treat this round as a frontend VOID and
       * immediately continue with the new Binance
       * candle.
       *
       * Proper onchain draw/refund support will be
       * handled separately because ForecastRegistryV2
       * was designed around Higher/Lower outcomes.
       */
      console.info(
        "PredArc: flat candle detected. Voiding frontend round and starting the next candle."
      );

      const nextMarket:
        PredictionMarket =
        selectedMarket;

      setRoundNumber(
        (
          currentRound
        ) =>
          currentRound + 1
      );

      setRoundMarket(
        nextMarket
      );

      startPriceRef.current =
        nextOpeningPrice;

      startPriceMarketRef.current =
        nextMarket;

      settledRoundRef.current =
        null;

      setStartPrice(
        nextOpeningPrice
      );

      setEndPrice(
        null
      );

      setResult(
        null
      );

      setStatus(
        "open"
      );

      const nextBoundary =
        (
          latestCandle.time +
          roundDuration
        ) *
        1000;

      roundEndsAtRef.current =
        nextBoundary;

      setTimeLeft(
        getRemainingSeconds(
          nextBoundary
        )
      );

      return;
    }

    const marketResult:
      RoundDirection =
      closingPrice >
      openingPrice
        ? "higher"
        : "lower";

    settledRoundRef.current =
      roundNumber;

    /*
     * Settle the prediction using the FINALIZED
     * Binance candle close.
     */
    settleRound(
      roundNumber,
      marketResult,
      openingPrice,
      closingPrice,
      roundMarket,
      roundDuration
    );

    /*
     * Immediately prepare the next round.
     *
     * No 2-second resolving screen.
     * No 5-second result screen.
     */
    const nextMarket:
      PredictionMarket =
      selectedMarket;

    setRoundNumber(
      (
        currentRound
      ) =>
        currentRound + 1
    );

    setRoundMarket(
      nextMarket
    );

    startPriceRef.current =
      nextOpeningPrice;

    startPriceMarketRef.current =
      nextMarket;

    settledRoundRef.current =
      null;

    setStartPrice(
      nextOpeningPrice
    );

    setEndPrice(
      null
    );

    setResult(
      null
    );

    setStatus(
      "open"
    );

    /*
     * latestCandle.time is the exact start of the
     * new Binance candle, in seconds.
     */
    const nextBoundary =
      (
        latestCandle.time +
        roundDuration
      ) *
      1000;

    roundEndsAtRef.current =
      nextBoundary;

    setTimeLeft(
      getRemainingSeconds(
        nextBoundary
      )
    );
  }, [
    timeLeft,
    status,
    roundNumber,
    roundDuration,
    roundMarket,
    selectedMarket,
    settleRound,
    isConnected,
    candles,
    timeframe,
  ]);

  const progress =
    status === "open"
      ? (
          timeLeft /
          roundDuration
        ) *
        100
      : 0;

  /*
   * Prediction can only open when
   * the visible market and round
   * market are exactly the same.
   */
  const isPredictionOpen =
    status === "open" &&
    startPrice !==
      null &&
    isConnected &&
    selectedMarket ===
      roundMarket &&
    startPriceMarketRef.current ===
      roundMarket;

  const value =
    useMemo<
      RoundContextValue
    >(
      () => ({
        roundNumber,

        timeLeft,

        status,

        result,

        progress,

        isPredictionOpen,

        startPrice,

        endPrice,

        roundMarket,

        canChangeMarket,

        roundDuration,

        setPredictionDuration,

        canChangeDuration,
      }),
      [
        roundNumber,
        timeLeft,
        status,
        result,
        progress,
        isPredictionOpen,
        startPrice,
        endPrice,
        roundMarket,
        canChangeMarket,
        roundDuration,
        setPredictionDuration,
        canChangeDuration,
      ]
    );

  return (
    <RoundContext.Provider
      value={value}
    >
      {children}
    </RoundContext.Provider>
  );
}

export function useRound():
  RoundContextValue {
  const context =
    useContext(
      RoundContext
    );

  if (!context) {
    throw new Error(
      "useRound must be used inside RoundProvider."
    );
  }

  return context;
}