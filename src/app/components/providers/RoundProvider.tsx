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
  | 900;

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

const RESOLVING_DURATION = 2;

const RESULT_DURATION = 5;

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
   * Find a pending prediction
   * for this exact round.
   */
  const currentRoundPrediction =
    predictions.find(
      (prediction) =>
        prediction.roundNumber ===
          roundNumber &&
        prediction.status ===
          "pending"
    );

  const hasCurrentRoundPrediction =
    Boolean(
      currentRoundPrediction
    );

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
   */
  useEffect(() => {
    const timer =
      window.setInterval(
        () => {
          setTimeLeft(
            (
              currentTime
            ) =>
              currentTime > 0
                ? currentTime -
                  1
                : 0
          );
        },
        1000
      );

    return () => {
      window.clearInterval(
        timer
      );
    };
  }, []);

  /*
   * Handle Open → Resolving →
   * Result → New Round.
   */
  useEffect(() => {
    if (
      timeLeft !== 0
    ) {
      return;
    }

    /*
     * ROUND OPEN FINISHED
     */
    if (
      status === "open"
    ) {
      setStatus(
        "resolving"
      );

      setTimeLeft(
        RESOLVING_DURATION
      );

      return;
    }

    /*
     * RESOLVE ROUND
     */
    if (
      status ===
      "resolving"
    ) {
      if (
        settledRoundRef.current ===
        roundNumber
      ) {
        return;
      }

      const openingPrice =
        startPriceRef.current;

      const closingPrice =
        latestPriceRef.current;

      /*
       * Critical market safety checks.
       *
       * If a SOL prediction is active,
       * we only settle when the currently
       * available live price is SOL.
       */
      const correctLiveMarket =
        latestPriceMarketRef.current ===
        roundMarket;

      const correctStartMarket =
        startPriceMarketRef.current ===
        roundMarket;

      if (
        openingPrice ===
          null ||
        closingPrice ===
          null ||
        !isConnected ||
        !correctLiveMarket ||
        !correctStartMarket ||
        selectedMarket !==
          roundMarket
      ) {
        /*
         * Never resolve using a price
         * from the wrong asset.
         *
         * Wait until the correct market
         * data is available again.
         */
        setTimeLeft(
          1
        );

        return;
      }

      /*
       * No artificial/random winner.
       * Wait until real price movement.
       */
      if (
        closingPrice ===
        openingPrice
      ) {
        setTimeLeft(
          1
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

      setEndPrice(
        closingPrice
      );

      setResult(
        marketResult
      );

      /*
       * Resolve only predictions
       * belonging to this asset.
       */
      settleRound(
        roundNumber,
        marketResult,
        openingPrice,
        closingPrice,
        roundMarket
      );

      setStatus(
        "result"
      );

      setTimeLeft(
        RESULT_DURATION
      );

      return;
    }

    /*
     * RESULT FINISHED:
     * prepare the next round.
     */
    const nextMarket:
      PredictionMarket =
      selectedMarket;

    startPriceRef.current =
      null;

    startPriceMarketRef.current =
      null;

    settledRoundRef.current =
      null;

    setRoundNumber(
      (
        currentRound
      ) =>
        currentRound + 1
    );

    setRoundMarket(
      nextMarket
    );

    setStartPrice(
      null
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

    setTimeLeft(
      roundDuration
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