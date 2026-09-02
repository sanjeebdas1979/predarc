"use client";

import {
  useEffect,
  useRef,
} from "react";

import {
  CandlestickSeries,
  ColorType,
  CrosshairMode,
  createChart,
  type CandlestickData,
  type IChartApi,
  type ISeriesApi,
  type UTCTimestamp,
} from "lightweight-charts";

import {
  useBtcPrice,
  type BtcTimeframe,
  type MarketSymbol,
} from "../providers/BtcPriceProvider";

function formatTimeframeLabel(
  timeframe: BtcTimeframe
): string {
  if (timeframe === "1m") {
    return "1-minute candles";
  }

  if (timeframe === "5m") {
    return "5-minute candles";
  }

  if (timeframe === "15m") {
    return "15-minute candles";
  }

  return "1-hour candles";
}

function getPricePrecision(
  market: MarketSymbol
): {
  precision: number;
  minMove: number;
} {
  if (market === "XRP") {
    return {
      precision: 4,
      minMove: 0.0001,
    };
  }

  if (
    market === "SOL" ||
    market === "BNB"
  ) {
    return {
      precision: 2,
      minMove: 0.01,
    };
  }

  if (market === "ETH") {
    return {
      precision: 2,
      minMove: 0.01,
    };
  }

  return {
    precision: 2,
    minMove: 0.01,
  };
}

function formatLivePrice(
  price: number,
  market: MarketSymbol
): string {
  const { precision } =
    getPricePrecision(market);

  return price.toLocaleString(
    undefined,
    {
      minimumFractionDigits:
        precision,
      maximumFractionDigits:
        precision,
    }
  );
}

export default function BtcPriceChart() {
  const {
    candles,
    data,
    isLoading,
    error,
    isConnected,
    timeframe,
    setTimeframe,
    selectedMarket,
  } = useBtcPrice();

  const containerRef =
    useRef<HTMLDivElement | null>(
      null
    );

  const chartRef =
    useRef<IChartApi | null>(
      null
    );

  const candleSeriesRef =
    useRef<ISeriesApi<"Candlestick"> | null>(
      null
    );

  const initializedDataRef =
    useRef(false);

  const activeTimeframeRef =
    useRef<BtcTimeframe>(
      "1m"
    );

  const activeMarketRef =
    useRef<MarketSymbol>(
      "BTC"
    );

  /*
   * Create the chart once.
   */
  useEffect(() => {
    const container =
      containerRef.current;

    if (!container) {
      return;
    }

    const chart =
      createChart(
        container,
        {
          width:
            container.clientWidth,

          height: 360,

          layout: {
            background: {
              type:
                ColorType.Solid,

              color:
                "#11151b",
            },

            textColor:
              "#94a3b8",
          },

          grid: {
            vertLines: {
              color:
                "rgba(148, 163, 184, 0.08)",
            },

            horzLines: {
              color:
                "rgba(148, 163, 184, 0.08)",
            },
          },

          crosshair: {
            mode:
              CrosshairMode.Normal,
          },

          rightPriceScale: {
            borderColor:
              "rgba(148, 163, 184, 0.20)",

            scaleMargins: {
              top: 0.12,
              bottom: 0.12,
            },
          },

          timeScale: {
            borderColor:
              "rgba(148, 163, 184, 0.20)",

            timeVisible: true,

            secondsVisible: false,

            rightOffset: 4,

            barSpacing: 10,
          },

          handleScroll: true,

          handleScale: true,
        }
      );

    const candleSeries =
      chart.addSeries(
        CandlestickSeries,
        {
          upColor:
            "#22c55e",

          downColor:
            "#ef4444",

          borderUpColor:
            "#22c55e",

          borderDownColor:
            "#ef4444",

          wickUpColor:
            "#22c55e",

          wickDownColor:
            "#ef4444",

          priceFormat: {
            type:
              "price",

            precision: 2,

            minMove: 0.01,
          },

          priceLineVisible:
            true,

          lastValueVisible:
            true,
        }
      );

    chartRef.current =
      chart;

    candleSeriesRef.current =
      candleSeries;

    const resizeObserver =
      new ResizeObserver(
        (entries) => {
          const firstEntry =
            entries[0];

          if (!firstEntry) {
            return;
          }

          chart.applyOptions({
            width:
              firstEntry
                .contentRect
                .width,
          });
        }
      );

    resizeObserver.observe(
      container
    );

    return () => {
      resizeObserver.disconnect();

      chart.remove();

      chartRef.current =
        null;

      candleSeriesRef.current =
        null;

      initializedDataRef.current =
        false;
    };
  }, []);

  /*
   * Update chart price precision
   * whenever the selected market changes.
   */
  useEffect(() => {
    const series =
      candleSeriesRef.current;

    if (!series) {
      return;
    }

    const {
      precision,
      minMove,
    } =
      getPricePrecision(
        selectedMarket
      );

    series.applyOptions({
      priceFormat: {
        type:
          "price",

        precision,

        minMove,
      },
    });
  }, [
    selectedMarket,
  ]);

  /*
   * Clear the old market chart immediately
   * when switching BTC / ETH / SOL / BNB / XRP.
   */
  useEffect(() => {
    const series =
      candleSeriesRef.current;

    if (!series) {
      return;
    }

    if (
      activeMarketRef.current ===
      selectedMarket
    ) {
      return;
    }

    series.setData([]);

    initializedDataRef.current =
      false;

    activeMarketRef.current =
      selectedMarket;
  }, [
    selectedMarket,
  ]);

  function changeTimeframe(
    nextTimeframe:
      BtcTimeframe
  ): void {
    if (
      nextTimeframe ===
      timeframe
    ) {
      return;
    }

    const series =
      candleSeriesRef.current;

    if (series) {
      series.setData([]);
    }

    initializedDataRef.current =
      false;

    activeTimeframeRef.current =
      nextTimeframe;

    setTimeframe(
      nextTimeframe
    );
  }

  /*
   * Load historical candles and
   * continuously update the live candle.
   */
  useEffect(() => {
    const series =
      candleSeriesRef.current;

    const chart =
      chartRef.current;

    if (
      !series ||
      !chart
    ) {
      return;
    }

    if (
      candles.length === 0
    ) {
      series.setData([]);

      initializedDataRef.current =
        false;

      return;
    }

    const chartData:
      CandlestickData<UTCTimestamp>[] =
      candles.map(
        (candle) => ({
          time:
            candle.time as UTCTimestamp,

          open:
            candle.open,

          high:
            candle.high,

          low:
            candle.low,

          close:
            candle.close,
        })
      );

    const needsCompleteReload =
      !initializedDataRef.current ||
      activeTimeframeRef.current !==
        timeframe ||
      activeMarketRef.current !==
        selectedMarket;

    if (
      needsCompleteReload
    ) {
      series.setData(
        chartData
      );

      activeTimeframeRef.current =
        timeframe;

      activeMarketRef.current =
        selectedMarket;

      initializedDataRef.current =
        true;

      chart
        .timeScale()
        .fitContent();

      return;
    }

    const latestCandle =
      chartData[
        chartData.length - 1
      ];

    if (!latestCandle) {
      return;
    }

    try {
      series.update(
        latestCandle
      );

      chart
        .timeScale()
        .scrollToRealTime();
    } catch {
      series.setData(
        chartData
      );

      chart
        .timeScale()
        .fitContent();
    }
  }, [
    candles,
    timeframe,
    selectedMarket,
  ]);

  const isChangingChart =
    isLoading &&
    candles.length === 0;

  return (
    <section className="rounded-3xl border border-white/10 bg-white/5 p-6 backdrop-blur-xl">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span
              className={`h-2 w-2 rounded-full ${
                isConnected
                  ? "bg-emerald-400"
                  : "bg-amber-400"
              }`}
            />

            <p className="text-sm text-white/60">
              Live{" "}
              {selectedMarket}{" "}
              Movement
            </p>
          </div>

          <h2 className="mt-1 text-xl font-semibold text-white">
            {selectedMarket}{" "}
            Candlestick Chart
          </h2>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {(
            [
              "1m",
              "5m",
              "15m",
              "1h",
            ] as BtcTimeframe[]
          ).map(
            (
              selectedTimeframe
            ) => (
              <button
                key={
                  selectedTimeframe
                }
                type="button"
                onClick={() =>
                  changeTimeframe(
                    selectedTimeframe
                  )
                }
                disabled={
                  isChangingChart &&
                  timeframe ===
                    selectedTimeframe
                }
                className={`rounded-lg px-3 py-1 text-xs font-semibold transition ${
                  timeframe ===
                  selectedTimeframe
                    ? "bg-orange-500 text-white"
                    : "bg-white/5 text-white/60 hover:bg-white/10 hover:text-white"
                } disabled:cursor-wait disabled:opacity-60`}
              >
                {
                  selectedTimeframe
                }
              </button>
            )
          )}

          <div className="ml-2 flex items-center gap-2">
            <span
              className={`h-2 w-2 rounded-full ${
                isConnected
                  ? "bg-emerald-400"
                  : "bg-amber-400"
              }`}
            />

            <span className="text-xs text-white/60">
              {isConnected
                ? "Live"
                : "Connecting"}
            </span>
          </div>
        </div>
      </div>

      <div className="relative mt-6 overflow-hidden rounded-2xl border border-white/10 bg-[#11151b]">
        <div
          ref={
            containerRef
          }
          className="h-[360px] w-full"
        />

        {isChangingChart && (
          <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center bg-[#11151b]/90 backdrop-blur-sm">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-white/10 border-t-orange-500" />

            <p className="mt-4 text-sm font-semibold text-white">
              Loading{" "}
              {selectedMarket}{" "}
              {timeframe} chart
            </p>

            <p className="mt-1 text-xs text-white/50">
              Fetching recent{" "}
              {selectedMarket}{" "}
              candles...
            </p>
          </div>
        )}
      </div>

      <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
        <p className="text-xs text-white/50">
          Binance{" "}
          {selectedMarket}
          /USDT •{" "}
          {formatTimeframeLabel(
            timeframe
          )}
        </p>

        {data && (
          <p className="text-xs text-white/60">
            Live price:{" "}
            <span className="font-medium text-white">
              $
              {formatLivePrice(
                data.price,
                selectedMarket
              )}
            </span>
          </p>
        )}
      </div>

      {error && (
        <p className="mt-3 text-xs text-amber-300">
          {error}
        </p>
      )}
    </section>
  );
}