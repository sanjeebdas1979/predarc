"use client";

import {
  useBtcPrice,
} from "../providers/BtcPriceProvider";

import {
  useRound,
} from "../providers/RoundProvider";

function formatTime(
  seconds: number
): string {
  const safeSeconds =
    Math.max(
      0,
      seconds
    );

  const minutes =
    Math.floor(
      safeSeconds / 60
    );

  const remainingSeconds =
    safeSeconds % 60;

  return `${minutes
    .toString()
    .padStart(2, "0")}:${remainingSeconds
    .toString()
    .padStart(2, "0")}`;
}

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
    return "—";
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

function formatDifference(
  difference: number | null,
  market: string
): string {
  if (
    difference === null ||
    !Number.isFinite(
      difference
    )
  ) {
    return "—";
  }

  const decimals =
    getPriceDecimals(
      market
    );

  const sign =
    difference > 0
      ? "+"
      : difference < 0
        ? "-"
        : "";

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
  duration: number
): string {
  if (duration === 60) {
    return "1m";
  }

  if (duration === 300) {
    return "5m";
  }

  if (duration === 900) {
    return "15m";
  }

  return `${duration}s`;
}

export default function CountdownTimer() {
  const {
    data,
  } = useBtcPrice();

  const {
    roundNumber,
    timeLeft,
    status,
    result,
    progress,
    startPrice,
    endPrice,
    roundMarket,
    roundDuration,
  } = useRound();

  const livePrice =
    data &&
    Number.isFinite(
      data.price
    )
      ? data.price
      : null;

  const displayPrice =
    status === "result" &&
    endPrice !== null
      ? endPrice
      : livePrice;

  const priceDifference =
    startPrice !== null &&
    displayPrice !== null
      ? displayPrice -
        startPrice
      : null;

  const movementDirection =
    priceDifference === null
      ? "flat"
      : priceDifference > 0
        ? "higher"
        : priceDifference < 0
          ? "lower"
          : "flat";

  const movementClass =
    movementDirection ===
    "higher"
      ? "text-emerald-400"
      : movementDirection ===
          "lower"
        ? "text-rose-400"
        : "text-gray-300";

  const statusLabel =
    status === "open"
      ? "OPEN"
      : status ===
          "resolving"
        ? "RESOLVING"
        : "RESULT";

  const statusClass =
    status === "open"
      ? "border-emerald-500/20 bg-emerald-500/10 text-emerald-400"
      : status ===
          "resolving"
        ? "border-yellow-500/20 bg-yellow-500/10 text-yellow-300"
        : result ===
            "higher"
          ? "border-emerald-500/20 bg-emerald-500/10 text-emerald-400"
          : "border-rose-500/20 bg-rose-500/10 text-rose-400";

  const progressWidth =
    status === "open"
      ? `${progress}%`
      : "100%";

  const progressColor =
    status === "resolving"
      ? "bg-yellow-400"
      : status === "result"
        ? result === "higher"
          ? "bg-emerald-500"
          : "bg-rose-500"
        : "bg-orange-500";

  return (
    <section className="overflow-hidden rounded-2xl border border-white/10 bg-[#0d121a]">
      {/* Progress directly below chart */}
      <div className="h-1.5 w-full bg-white/[0.06]">
        <div
          className={`h-full ${progressColor} transition-[width] duration-500 ease-out`}
          style={{
            width:
              progressWidth,
          }}
        />
      </div>

      <div className="p-4 sm:p-5">
        {/* Compact Header */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-3">
            <p className="text-[10px] font-black uppercase tracking-[0.18em] text-orange-400">
              Live Forecast Round
            </p>

            <span className="rounded-full border border-white/10 bg-white/[0.03] px-2 py-0.5 text-[9px] font-bold text-gray-400">
              {formatDuration(
                roundDuration
              )}
            </span>

            <span className="text-base font-bold text-white">
              Round #
              {roundNumber}
            </span>

            <span className="text-[10px] font-semibold text-gray-500">
              {roundMarket}
              /USDT
            </span>
          </div>

          <span
            className={`rounded-full border px-2.5 py-1 text-[9px] font-black tracking-wide ${statusClass}`}
          >
            {status ===
            "resolving" && (
              <span className="mr-1.5 inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-yellow-300" />
            )}

            {statusLabel}
          </span>
        </div>

        {/* Compact Data Row */}
        <div className="mt-4 grid gap-2.5 sm:grid-cols-4">
          {/* Time */}
          <div className="rounded-xl border border-white/10 bg-white/[0.02] px-3 py-3">
            <p className="text-[9px] font-semibold uppercase tracking-[0.12em] text-gray-500">
              {status ===
              "open"
                ? "Time Remaining"
                : status ===
                    "resolving"
                  ? "Finalizing"
                  : "Complete"}
            </p>

            <p className="mt-1.5 font-mono text-2xl font-black tracking-tight text-white">
              {status ===
              "open"
                ? formatTime(
                    timeLeft
                  )
                : status ===
                    "resolving"
                  ? "•••"
                  : result ===
                      "higher"
                    ? "↑ HIGHER"
                    : result ===
                        "lower"
                      ? "↓ LOWER"
                      : "—"}
            </p>
          </div>

          {/* Start */}
          <div className="rounded-xl border border-white/10 bg-white/[0.02] px-3 py-3">
            <p className="text-[9px] font-semibold uppercase tracking-[0.12em] text-gray-500">
              Start Price
            </p>

            <p className="mt-1.5 font-mono text-sm font-bold text-white">
              {formatPrice(
                startPrice,
                roundMarket
              )}
            </p>
          </div>

          {/* Live / Final */}
          <div className="rounded-xl border border-white/10 bg-white/[0.02] px-3 py-3">
            <p className="text-[9px] font-semibold uppercase tracking-[0.12em] text-gray-500">
              {status ===
              "result"
                ? "Final Price"
                : "Live Price"}
            </p>

            <p className="mt-1.5 font-mono text-sm font-bold text-white">
              {formatPrice(
                displayPrice,
                roundMarket
              )}
            </p>
          </div>

          {/* Movement */}
          <div className="rounded-xl border border-white/10 bg-white/[0.02] px-3 py-3">
            <p className="text-[9px] font-semibold uppercase tracking-[0.12em] text-gray-500">
              Price Movement
            </p>

            <p
              className={`mt-1.5 font-mono text-sm font-black ${movementClass}`}
            >
              {formatDifference(
                priceDifference,
                roundMarket
              )}

              {movementDirection ===
              "higher"
                ? " ↑"
                : movementDirection ===
                    "lower"
                  ? " ↓"
                  : ""}
            </p>
          </div>
        </div>

        {/* Small live state line */}
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-[10px]">
          <div className="flex items-center gap-2 text-gray-500">
            <span
              className={`h-1.5 w-1.5 rounded-full ${
                status ===
                "resolving"
                  ? "animate-pulse bg-yellow-400"
                  : movementDirection ===
                      "higher"
                    ? "bg-emerald-400"
                    : movementDirection ===
                        "lower"
                      ? "bg-rose-400"
                      : "bg-gray-500"
              }`}
            />

            {status ===
            "open"
              ? `${roundMarket} live against this candle's opening price`
              : status ===
                  "resolving"
                ? `Finalizing Binance ${roundMarket} candle`
                : `${roundMarket} round settled`}
          </div>

          <span className="font-mono text-gray-600">
            {status ===
            "open"
              ? `${Math.round(
                  progress
                )}%`
              : status ===
                  "resolving"
                ? "FINALIZING"
                : "100%"}
          </span>
        </div>
      </div>
    </section>
  );
}