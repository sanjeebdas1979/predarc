"use client";

import {
  useMemo,
} from "react";

import {
  useBtcPrice,
} from "../providers/BtcPriceProvider";

import { useAccount } from "wagmi";

import MarketLogo from "../market/MarketLogo";

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

  const {
    chainId: walletChainId,
    isConnected: isWalletConnected,
  } = useAccount();

  const walletNetworkLabel =
    !isWalletConnected ||
    walletChainId === undefined
      ? "Wallet not connected"
      : walletChainId === 5042
        ? "Arc Mainnet"
        : walletChainId === 5042002
          ? "Arc Testnet"
          : walletChainId === 1
            ? "Ethereum Mainnet"
            : `Chain ${walletChainId}`;

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
            <MarketLogo
              market={selectedMarket}
              className="h-9 w-9"
            />

            <h2 className="text-2xl font-black">
              {market?.pair ??
                `${selectedMarket}/USDT`}
            </h2>

            <span className="pb-0.5 text-xs text-gray-600">
              {market?.name ??
                selectedMarket}
            </span>
          </div>

        </div>

        <div className="flex shrink-0 flex-col items-end gap-2 text-right">
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

          <div>
            <p className="font-mono text-base font-black tracking-tight text-white sm:text-lg">
              {formatPrice(
                data?.price ?? null,
                selectedMarket
              )}
            </p>

            <span
              className={`text-[10px] font-black ${changeClass}`}
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
            {walletNetworkLabel}
          </p>
        </div>
      </div>
    </div>
  );
}
