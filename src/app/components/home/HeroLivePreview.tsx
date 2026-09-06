"use client";

import {
  useMemo,
} from "react";

import {
  useBtcPrice,
} from "../providers/BtcPriceProvider";

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

export default function HeroLivePreview() {
  const {
    data,
    candles,
    selectedMarket,
    timeframe,
    isConnected,
    marketOptions,
  } = useBtcPrice();

  const market =
    marketOptions.find(
      (item) =>
        item.symbol ===
        selectedMarket
    );

  const recentCandles =
    useMemo(
      () =>
        candles.slice(-28),
      [candles]
    );

  const {
    minPrice,
    maxPrice,
  } = useMemo(() => {
    if (
      recentCandles.length === 0
    ) {
      return {
        minPrice: 0,
        maxPrice: 0,
      };
    }

    const lows =
      recentCandles.map(
        (candle) =>
          candle.low
      );

    const highs =
      recentCandles.map(
        (candle) =>
          candle.high
      );

    return {
      minPrice:
        Math.min(...lows),
      maxPrice:
        Math.max(...highs),
    };
  }, [recentCandles]);

  const range =
    maxPrice - minPrice;

  const latestCandle =
    recentCandles.length > 0
      ? recentCandles[
          recentCandles.length - 1
        ]
      : null;

  const change24h =
    data &&
    Number.isFinite(
      data.change24h
    )
      ? data.change24h
      : null;

  const changeClass =
    change24h === null
      ? "text-gray-500"
      : change24h >= 0
        ? "text-emerald-400"
        : "text-rose-400";

  return (
    <div className="relative overflow-hidden rounded-[2rem] border border-white/10 bg-[#0b111a]/95 p-5 shadow-[0_35px_100px_rgba(0,0,0,0.45)] sm:p-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-[10px] font-black uppercase tracking-[0.18em] text-orange-400">
            Live Market Preview
          </p>

          <div className="mt-2 flex flex-wrap items-end gap-x-3 gap-y-1">
            <h2 className="text-2xl font-black">
              {market?.pair ??
                `${selectedMarket}/USDT`}
            </h2>

            <span className="pb-0.5 text-xs text-gray-600">
              {market?.name ??
                selectedMarket}
            </span>
          </div>

          <div className="mt-2 flex flex-wrap items-center gap-3">
            <p className="font-mono text-lg font-black tracking-tight text-white sm:text-xl">
              {formatPrice(
                data?.price ?? null,
                selectedMarket
              )}
            </p>

            <span
              className={`text-xs font-black ${changeClass}`}
            >
              {change24h === null
                ? "Waiting..."
                : `${
                    change24h >= 0
                      ? "+"
                      : ""
                  }${change24h.toFixed(
                    2
                  )}%`}
            </span>
          </div>
        </div>

        <span
          className={`rounded-full border px-3 py-1 text-[9px] font-black shadow-[0_0_24px_rgba(16,185,129,0.08)] ${
            isConnected
              ? "border-emerald-500/20 bg-emerald-500/10 text-emerald-400"
              : "border-yellow-500/20 bg-yellow-500/10 text-yellow-300"
          }`}
        >
          {isConnected
            ? "LIVE"
            : "CONNECTING"}
        </span>
      </div>

      {/* Real candle mini chart */}
      <div className="relative mt-5 h-52 overflow-hidden rounded-2xl border border-white/[0.08] bg-[#080d14] shadow-inner sm:h-60">
        <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.035)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.035)_1px,transparent_1px)] bg-[size:42px_42px]" />

        {recentCandles.length > 0 ? (
          <div className="absolute inset-x-[6%] bottom-[18%] top-[12%] flex items-end gap-1">
            {recentCandles.map(
              (
                candle,
                index
              ) => {
                const normalizedHeight =
                  range > 0
                    ? ((candle.close -
                        minPrice) /
                        range) *
                        70 +
                      18
                    : 50;

                const isHigher =
                  candle.close >=
                  candle.open;

                return (
                  <div
                    key={`${candle.time}-${index}`}
                    className="flex h-full flex-1 items-end"
                  >
                    <div
                      className={`w-full min-w-[2px] rounded-t-[2px] ${
                        isHigher
                          ? "bg-emerald-500/90"
                          : "bg-rose-500/90"
                      }`}
                      style={{
                        height:
                          `${Math.max(
                            8,
                            Math.min(
                              92,
                              normalizedHeight
                            )
                          )}%`,
                      }}
                    />
                  </div>
                );
              }
            )}
          </div>
        ) : (
          <div className="absolute inset-0 flex items-center justify-center">
            <p className="text-xs text-gray-600">
              Loading live Binance candles...
            </p>
          </div>
        )}

        <div className="absolute bottom-4 left-4 flex items-center gap-2 text-[9px] font-semibold text-gray-600">
          <span
            className={`h-1.5 w-1.5 rounded-full ${
              isConnected
                ? "bg-emerald-400"
                : "bg-yellow-400"
            }`}
          />

          Binance{" "}
          {selectedMarket}
          /USDT ·{" "}
          {timeframe}
        </div>

        {latestCandle && (
          <div className="absolute right-4 top-4 rounded-lg border border-white/10 bg-black/40 px-3 py-2 backdrop-blur">
            <p className="text-[8px] uppercase tracking-wide text-gray-600">
              Latest candle
            </p>

            <p
              className={`mt-1 font-mono text-xs font-black ${
                latestCandle.close >=
                latestCandle.open
                  ? "text-emerald-400"
                  : "text-rose-400"
              }`}
            >
              {formatPrice(
                latestCandle.close,
                selectedMarket
              )}
            </p>
          </div>
        )}
      </div>

      {/* Summary */}
      <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-3">
        <div className="rounded-xl border border-white/[0.08] bg-white/[0.025] p-3">
          <p className="text-[9px] uppercase tracking-wide text-gray-600">
            Candle
          </p>

          <p className="mt-1 text-sm font-black">
            {timeframe}
          </p>
        </div>

        <div className="rounded-xl border border-white/[0.08] bg-white/[0.025] p-3">
          <p className="text-[9px] uppercase tracking-wide text-gray-600">
            Forecast
          </p>

          <p className="mt-1 text-sm font-black text-emerald-400">
            Higher / Lower
          </p>
        </div>

        <div className="rounded-xl border border-white/[0.08] bg-white/[0.025] p-3">
          <p className="text-[9px] uppercase tracking-wide text-gray-600">
            Network
          </p>

          <p className="mt-1 text-sm font-black text-orange-400">
            Arc Testnet
          </p>
        </div>
      </div>
    </div>
  );
}