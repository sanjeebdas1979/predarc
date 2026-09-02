"use client";

import { useRound } from "../providers/RoundProvider";

function formatTime(
  seconds: number
): string {
  const minutes =
    Math.floor(seconds / 60);

  const remainingSeconds =
    seconds % 60;

  return `${minutes
    .toString()
    .padStart(
      2,
      "0"
    )}:${remainingSeconds
    .toString()
    .padStart(
      2,
      "0"
    )}`;
}

function getPriceDecimals(
  market: string
): number {
  if (market === "XRP") {
    return 4;
  }

  return 2;
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
    difference >= 0
      ? "+"
      : "-";

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

export default function CountdownTimer() {
  const {
    roundNumber,
    timeLeft,
    status,
    result,
    progress,
    startPrice,
    endPrice,
    roundMarket,
  } = useRound();

  const priceDifference =
    startPrice !== null &&
    endPrice !== null
      ? endPrice -
        startPrice
      : null;

  return (
    <div>
      {/* Round Header */}
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-sm text-gray-400">
            Round #
            {roundNumber}
          </p>

          <p className="mt-1 text-[10px] font-bold uppercase tracking-[0.14em] text-orange-400">
            {roundMarket}
            /USDT
          </p>
        </div>

        <span
          className={`rounded-full px-3 py-1 text-xs font-semibold ${
            status ===
            "open"
              ? "bg-emerald-500/10 text-emerald-400"
              : status ===
                  "resolving"
                ? "bg-yellow-500/10 text-yellow-400"
                : "bg-orange-500/10 text-orange-400"
          }`}
        >
          {status ===
          "open"
            ? "OPEN"
            : status ===
                "resolving"
              ? "RESOLVING"
              : "RESULT"}
        </span>
      </div>

      {/* OPEN */}
      {status ===
        "open" && (
        <>
          <p className="mt-3 font-mono text-3xl font-bold">
            {formatTime(
              timeLeft
            )}
          </p>

          <div className="mt-4 h-2 overflow-hidden rounded-full bg-white/10">
            <div
              className="h-full rounded-full bg-orange-500 transition-all duration-1000"
              style={{
                width: `${progress}%`,
              }}
            />
          </div>

          <div className="mt-4 rounded-xl border border-white/10 bg-white/5 p-3">
            <div className="flex items-center justify-between gap-3">
              <p className="text-xs text-gray-500">
                Round start
                price
              </p>

              <span className="rounded-full border border-white/10 bg-white/[0.03] px-2 py-1 text-[9px] font-bold text-gray-400">
                {roundMarket}
              </span>
            </div>

            <p className="mt-1 font-mono text-lg font-semibold text-white">
              {formatPrice(
                startPrice,
                roundMarket
              )}
            </p>
          </div>

          <p className="mt-3 text-sm text-gray-500">
            {roundMarket}{" "}
            direction
            forecast
          </p>
        </>
      )}

      {/* RESOLVING */}
      {status ===
        "resolving" && (
        <div className="mt-5 rounded-2xl border border-yellow-500/20 bg-yellow-500/10 p-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="font-semibold text-yellow-300">
                Resolving{" "}
                {roundMarket}{" "}
                round...
              </p>

              <p className="mt-1 text-sm leading-5 text-gray-400">
                Comparing the
                live{" "}
                {roundMarket}{" "}
                closing price
                with this
                round&apos;s
                start price.
              </p>
            </div>

            <span className="shrink-0 rounded-full border border-yellow-500/20 bg-yellow-500/10 px-2.5 py-1 text-[9px] font-black text-yellow-300">
              {roundMarket}
              /USDT
            </span>
          </div>

          <div className="mt-4 rounded-xl border border-white/10 bg-black/10 p-3">
            <p className="text-xs text-gray-500">
              {roundMarket}{" "}
              start price
            </p>

            <p className="mt-1 font-mono text-base font-semibold text-white">
              {formatPrice(
                startPrice,
                roundMarket
              )}
            </p>
          </div>

          <div className="mt-3 flex items-center gap-2 text-[10px] text-yellow-200/60">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-yellow-400" />

            Waiting for
            final{" "}
            {roundMarket}{" "}
            market price
          </div>
        </div>
      )}

      {/* RESULT */}
      {status ===
        "result" &&
        result && (
          <div
            className={`mt-5 rounded-2xl border p-4 ${
              result ===
              "higher"
                ? "border-emerald-500/30 bg-emerald-500/10"
                : "border-rose-500/30 bg-rose-500/10"
            }`}
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-sm text-gray-400">
                  Round result
                </p>

                <p
                  className={`mt-2 text-2xl font-bold ${
                    result ===
                    "higher"
                      ? "text-emerald-400"
                      : "text-rose-400"
                  }`}
                >
                  {
                    roundMarket
                  }{" "}
                  moved{" "}
                  {result.toUpperCase()}
                </p>
              </div>

              <span
                className={`shrink-0 rounded-full border px-2.5 py-1 text-[9px] font-black ${
                  result ===
                  "higher"
                    ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-400"
                    : "border-rose-500/30 bg-rose-500/10 text-rose-400"
                }`}
              >
                {roundMarket}
                /USDT
              </span>
            </div>

            <div className="mt-4 space-y-3 rounded-xl border border-white/10 bg-black/10 p-3">
              <div className="flex items-center justify-between gap-4">
                <span className="text-xs text-gray-500">
                  Start price
                </span>

                <span className="font-mono text-sm font-semibold text-white">
                  {formatPrice(
                    startPrice,
                    roundMarket
                  )}
                </span>
              </div>

              <div className="flex items-center justify-between gap-4">
                <span className="text-xs text-gray-500">
                  End price
                </span>

                <span className="font-mono text-sm font-semibold text-white">
                  {formatPrice(
                    endPrice,
                    roundMarket
                  )}
                </span>
              </div>

              <div className="border-t border-white/10 pt-3">
                <div className="flex items-center justify-between gap-4">
                  <span className="text-xs text-gray-500">
                    Price
                    difference
                  </span>

                  <span
                    className={`font-mono text-sm font-semibold ${
                      priceDifference !==
                        null &&
                      priceDifference >=
                        0
                        ? "text-emerald-400"
                        : "text-rose-400"
                    }`}
                  >
                    {formatDifference(
                      priceDifference,
                      roundMarket
                    )}
                  </span>
                </div>
              </div>
            </div>

            <div className="mt-3 flex items-center justify-between gap-3">
              <p className="text-sm text-gray-500">
                Next round
                starts in{" "}
                {timeLeft}s
              </p>

              <p className="text-[10px] font-bold text-gray-600">
                {
                  roundMarket
                }{" "}
                ROUND
              </p>
            </div>
          </div>
        )}
    </div>
  );
}