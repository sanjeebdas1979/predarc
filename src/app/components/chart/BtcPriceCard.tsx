"use client";

import {
  MARKET_OPTIONS,
  useBtcPrice,
} from "../providers/BtcPriceProvider";

function formatPrice(
  price: number
): string {
  if (price >= 1000) {
    return `$${price.toLocaleString(undefined, {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })}`;
  }

  if (price >= 1) {
    return `$${price.toLocaleString(undefined, {
      minimumFractionDigits: 2,
      maximumFractionDigits: 4,
    })}`;
  }

  return `$${price.toLocaleString(undefined, {
    minimumFractionDigits: 4,
    maximumFractionDigits: 6,
  })}`;
}

function formatUpdatedTime(
  timestamp: number
): string {
  return new Date(timestamp).toLocaleTimeString(
    undefined,
    {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    }
  );
}

export default function BtcPriceCard() {
  const {
    data,
    selectedMarket,
    isConnected,
    isLoading,
    error,
    refreshPrice,
  } = useBtcPrice();

  const selectedMarketInfo =
    MARKET_OPTIONS.find(
      (market) =>
        market.symbol === selectedMarket
    );

  const marketName =
    selectedMarketInfo?.name ??
    selectedMarket;

  const change24h =
    data?.change24h ?? 0;

  const isPositive =
    change24h >= 0;

  return (
    <section className="rounded-3xl border border-white/10 bg-[#0d121a] p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <p className="text-xs font-medium text-gray-500">
              Live Market Price
            </p>

            <span
              className={`h-1.5 w-1.5 rounded-full ${
                isConnected
                  ? "bg-emerald-400"
                  : "bg-yellow-400"
              }`}
            />
          </div>

          <h3 className="mt-2 text-lg font-black text-white">
            {selectedMarket}/USDT
          </h3>

          <p className="mt-0.5 text-xs text-gray-500">
            {marketName}
          </p>
        </div>

        <button
          type="button"
          onClick={refreshPrice}
          disabled={isLoading}
          className="rounded-xl border border-white/10 bg-white/[0.02] px-3 py-2 text-xs font-medium text-gray-300 transition hover:border-white/20 hover:bg-white/[0.05] disabled:cursor-wait disabled:opacity-50"
        >
          {isLoading
            ? "Loading..."
            : "Refresh"}
        </button>
      </div>

      <div className="mt-6">
        {data ? (
          <>
            <p className="text-3xl font-black tracking-tight text-white">
              {formatPrice(data.price)}
            </p>

            <div className="mt-3 flex flex-wrap items-center gap-2 text-sm">
              <span className="text-gray-500">
                24h change
              </span>

              <span
                className={`font-bold ${
                  isPositive
                    ? "text-emerald-400"
                    : "text-rose-400"
                }`}
              >
                {isPositive ? "+" : ""}
                {change24h.toFixed(2)}%
              </span>
            </div>

            <p className="mt-3 text-xs text-gray-600">
              Updated{" "}
              {formatUpdatedTime(
                data.updatedAt
              )}
            </p>
          </>
        ) : (
          <div className="py-3">
            <p className="text-lg font-semibold text-gray-400">
              {isLoading
                ? `Loading ${selectedMarket} price...`
                : `${selectedMarket} price unavailable`}
            </p>
          </div>
        )}
      </div>

      {error && (
        <div className="mt-4 rounded-xl border border-rose-500/20 bg-rose-500/[0.06] p-3">
          <p className="text-xs leading-5 text-rose-300">
            {error}
          </p>
        </div>
      )}

      <div className="mt-5 border-t border-white/[0.06] pt-4">
        <div className="flex items-center justify-between text-[10px] font-semibold uppercase tracking-wider">
          <span className="text-gray-600">
            Data Source
          </span>

          <div className="flex items-center gap-1.5">
            <span
              className={`h-1.5 w-1.5 rounded-full ${
                isConnected
                  ? "bg-emerald-400"
                  : "bg-yellow-400"
              }`}
            />

            <span className="text-gray-400">
              Binance
            </span>
          </div>
        </div>
      </div>
    </section>
  );
}