"use client";

import {
  useBtcPrice,
  type MarketSymbol,
} from "../providers/BtcPriceProvider";

import {
  useRound,
} from "../providers/RoundProvider";

type MarketMeta = {
  symbol: MarketSymbol;
  name: string;
  icon: string;
  description: string;
};

const MARKET_META: MarketMeta[] = [
  {
    symbol: "BTC",
    name: "Bitcoin",
    icon: "₿",
    description: "BTC / USDT",
  },
  {
    symbol: "ETH",
    name: "Ethereum",
    icon: "Ξ",
    description: "ETH / USDT",
  },
  {
    symbol: "SOL",
    name: "Solana",
    icon: "◎",
    description: "SOL / USDT",
  },
  {
    symbol: "BNB",
    name: "BNB",
    icon: "B",
    description: "BNB / USDT",
  },
  {
    symbol: "XRP",
    name: "XRP",
    icon: "X",
    description: "XRP / USDT",
  },
];

function formatPrice(
  price: number | null | undefined,
  market: MarketSymbol
): string {
  if (
    price === null ||
    price === undefined ||
    !Number.isFinite(price)
  ) {
    return "--";
  }

  const maximumFractionDigits =
    market === "XRP"
      ? 4
      : price >= 1000
        ? 2
        : price >= 1
          ? 2
          : 4;

  return `$${price.toLocaleString(undefined, {
    minimumFractionDigits:
      market === "XRP" ? 4 : 2,
    maximumFractionDigits,
  })}`;
}

export default function MarketSelector() {
  const {
    selectedMarket,
    setSelectedMarket,
    data,
    isConnected,
    timeframe,
  } = useBtcPrice();

  const {
    roundNumber,
    roundMarket,
    canChangeMarket,
    status,
  } = useRound();

  const selectedMeta =
    MARKET_META.find(
      (market) =>
        market.symbol === selectedMarket
    ) ?? MARKET_META[0];

  const change24h =
    data?.change24h ?? null;

  const changeText =
    change24h === null
      ? "--"
      : `${change24h >= 0 ? "+" : ""}${change24h.toFixed(
          2
        )}%`;

  const changeClass =
    change24h === null
      ? "text-gray-400"
      : change24h >= 0
        ? "text-emerald-400"
        : "text-rose-400";

  const timeframeLabel =
    timeframe === "1m"
      ? "1 Minute"
      : timeframe === "5m"
        ? "5 Minutes"
        : timeframe === "15m"
          ? "15 Minutes"
          : "1 Hour";

  function selectMarket(
    market: MarketSymbol
  ): void {
    /*
     * The currently active market can remain
     * selected, but switching to another asset
     * is blocked while the round is locked.
     */
    if (
      !canChangeMarket &&
      market !== selectedMarket
    ) {
      return;
    }

    setSelectedMarket(
      market
    );
  }

  return (
    <section className="mt-10">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-orange-400" />

            <p className="text-xs font-bold uppercase tracking-[0.18em] text-orange-400">
              Explore Markets
            </p>
          </div>

          <h3 className="mt-2 text-2xl font-black text-white sm:text-3xl">
            Choose your forecast market
          </h3>

          <p className="mt-2 max-w-xl text-sm leading-6 text-gray-500">
            Select an asset to load live Binance
            market data and prepare your next
            forecast.
          </p>
        </div>

        <div
          className={`flex w-fit items-center gap-2 rounded-full border px-3 py-2 text-xs font-bold ${
            isConnected
              ? "border-emerald-500/25 bg-emerald-500/[0.08] text-emerald-400"
              : "border-yellow-500/25 bg-yellow-500/[0.08] text-yellow-400"
          }`}
        >
          <span
            className={`h-2 w-2 rounded-full ${
              isConnected
                ? "bg-emerald-400 shadow-[0_0_10px_rgba(52,211,153,0.8)]"
                : "bg-yellow-400"
            }`}
          />

          {isConnected
            ? "Live"
            : "Connecting"}
        </div>
      </div>

      {/* Market Lock Notice */}
      {!canChangeMarket && (
        <div className="mt-5 flex flex-col gap-3 rounded-2xl border border-orange-500/25 bg-orange-500/[0.07] p-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-orange-500/30 bg-orange-500/10 text-sm">
              🔒
            </div>

            <div>
              <p className="text-sm font-bold text-orange-300">
                {roundMarket} market locked
              </p>

              <p className="mt-1 text-xs leading-5 text-gray-400">
                Market switching is disabled until
                Round #{roundNumber} finishes.
              </p>
            </div>
          </div>

          <span className="w-fit rounded-full border border-orange-500/25 bg-orange-500/10 px-3 py-1.5 text-[9px] font-black uppercase tracking-[0.12em] text-orange-400">
            {status === "resolving"
              ? "Resolving"
              : status === "result"
                ? "Result"
                : "Prediction Active"}
          </span>
        </div>
      )}

      {/* Market Cards */}
      <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {MARKET_META.map((market) => {
          const isSelected =
            selectedMarket ===
            market.symbol;

          const isDisabled =
            !canChangeMarket &&
            !isSelected;

          return (
            <button
              key={market.symbol}
              type="button"
              disabled={isDisabled}
              onClick={() =>
                selectMarket(
                  market.symbol
                )
              }
              className={`relative overflow-hidden rounded-2xl border p-4 text-left transition-all duration-200 ${
                isSelected
                  ? "border-orange-500/80 bg-gradient-to-br from-orange-500/[0.16] via-orange-500/[0.07] to-transparent shadow-[0_0_0_1px_rgba(249,115,22,0.08),0_18px_45px_rgba(0,0,0,0.28)]"
                  : isDisabled
                    ? "cursor-not-allowed border-white/[0.05] bg-[#0c1118] opacity-35"
                    : "border-white/[0.08] bg-[#10161f] hover:-translate-y-0.5 hover:border-white/[0.18] hover:bg-[#131a24]"
              }`}
            >
              {isSelected && (
                <div className="absolute inset-x-0 top-0 h-[2px] bg-gradient-to-r from-transparent via-orange-400 to-transparent" />
              )}

              {isDisabled && (
                <div className="absolute right-3 top-3 flex h-6 w-6 items-center justify-center rounded-full border border-white/10 bg-black/30 text-[10px]">
                  🔒
                </div>
              )}

              <div className="flex items-start justify-between gap-3">
                <div
                  className={`flex h-11 w-11 items-center justify-center rounded-xl border text-xl font-black ${
                    isSelected
                      ? "border-orange-400/40 bg-orange-400/10 text-orange-300"
                      : "border-white/10 bg-black/20 text-gray-200"
                  }`}
                >
                  {market.icon}
                </div>

                {isSelected && (
                  <span className="rounded-full border border-orange-500/30 bg-orange-500/10 px-2.5 py-1 text-[9px] font-black uppercase tracking-[0.14em] text-orange-300">
                    Active
                  </span>
                )}
              </div>

              <div className="mt-5">
                <p className="text-lg font-black text-white">
                  {market.symbol}
                </p>

                <p className="mt-1 text-xs font-medium text-gray-500">
                  {market.name}
                </p>
              </div>

              <div className="mt-4 border-t border-white/[0.06] pt-3">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-600">
                    {market.description}
                  </p>

                  <span
                    className={`text-xs font-bold ${
                      isSelected
                        ? "text-orange-400"
                        : "text-gray-600"
                    }`}
                  >
                    {isDisabled
                      ? "🔒"
                      : "→"}
                  </span>
                </div>
              </div>
            </button>
          );
        })}
      </div>

      {/* Selected Market Panel */}
      <div className="mt-5 overflow-hidden rounded-2xl border border-white/[0.08] bg-[#0a0f16]">
        <div className="flex flex-col gap-5 p-5 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-4">
            <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl border border-orange-500/30 bg-gradient-to-br from-orange-500/20 to-orange-500/[0.04] text-2xl font-black text-orange-300">
              {selectedMeta.icon}
            </div>

            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h4 className="text-xl font-black text-white">
                  {selectedMeta.symbol}
                  /USDT
                </h4>

                <span className="rounded-md border border-white/[0.08] bg-white/[0.04] px-2 py-1 text-[9px] font-bold uppercase tracking-[0.12em] text-gray-400">
                  Live
                </span>

                {!canChangeMarket && (
                  <span className="rounded-md border border-orange-500/25 bg-orange-500/10 px-2 py-1 text-[9px] font-bold uppercase tracking-[0.12em] text-orange-400">
                    Locked
                  </span>
                )}
              </div>

              <p className="mt-1 text-sm text-gray-500">
                {selectedMeta.name}
              </p>
            </div>
          </div>

          <div className="rounded-xl border border-white/[0.07] bg-white/[0.025] px-4 py-3 sm:text-right">
            <p className="text-[10px] font-bold uppercase tracking-wider text-gray-600">
              Selected Forecast
            </p>

            <p className="mt-1 text-sm font-bold text-white">
              {selectedMeta.symbol}

              <span className="mx-2 text-gray-700">
                •
              </span>

              {timeframeLabel}
            </p>
          </div>
        </div>

        {/* Market Stats */}
        <div className="grid border-t border-white/[0.07] sm:grid-cols-3">
          <div className="border-b border-white/[0.07] p-5 sm:border-b-0 sm:border-r">
            <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-gray-600">
              Current Price
            </p>

            <p className="mt-2 text-2xl font-black text-white">
              {formatPrice(
                data?.price,
                selectedMarket
              )}
            </p>
          </div>

          <div className="border-b border-white/[0.07] p-5 sm:border-b-0 sm:border-r">
            <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-gray-600">
              24h Change
            </p>

            <p
              className={`mt-2 text-2xl font-black ${changeClass}`}
            >
              {changeText}
            </p>
          </div>

          <div className="p-5">
            <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-gray-600">
              Data Source
            </p>

            <div className="mt-2 flex items-center gap-2">
              <span
                className={`h-2.5 w-2.5 rounded-full ${
                  isConnected
                    ? "bg-emerald-400 shadow-[0_0_12px_rgba(52,211,153,0.65)]"
                    : "bg-yellow-400"
                }`}
              />

              <p className="text-lg font-black text-white">
                Binance
              </p>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex flex-col gap-2 border-t border-white/[0.07] bg-white/[0.015] px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-xs text-gray-600">
            {canChangeMarket
              ? "Choose another asset before submitting your next forecast."
              : `${roundMarket} is locked to Round #${roundNumber} until settlement completes.`}
          </p>

          <div className="flex items-center gap-2">
            <span
              className={`h-1.5 w-1.5 rounded-full ${
                canChangeMarket
                  ? "bg-orange-400"
                  : "bg-yellow-400"
              }`}
            />

            <p
              className={`text-xs font-bold ${
                canChangeMarket
                  ? "text-orange-400"
                  : "text-yellow-400"
              }`}
            >
              {canChangeMarket
                ? `${selectedMeta.symbol} market active`
                : `${roundMarket} round locked`}
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}