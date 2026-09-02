import {
  NextRequest,
  NextResponse,
} from "next/server";

export const dynamic =
  "force-dynamic";

export const revalidate = 0;

const ALLOWED_INTERVALS =
  new Set([
    "1m",
    "5m",
    "15m",
    "1h",
  ]);

const ALLOWED_SYMBOLS =
  new Set([
    "BTC",
    "ETH",
    "SOL",
    "BNB",
    "XRP",
  ]);

const BINANCE_ENDPOINTS = [
  "https://data-api.binance.vision",
  "https://api.binance.com",
  "https://api-gcp.binance.com",
];

type BinanceKline = [
  number,
  string,
  string,
  string,
  string,
  string,
  number,
  string,
  number,
  string,
  string,
  string
];

type MarketSymbol =
  | "BTC"
  | "ETH"
  | "SOL"
  | "BNB"
  | "XRP";

function isMarketSymbol(
  value: string
): value is MarketSymbol {
  return ALLOWED_SYMBOLS.has(
    value
  );
}

function getBinancePair(
  symbol: MarketSymbol
): string {
  return `${symbol}USDT`;
}

async function fetchKlines(
  symbol: MarketSymbol,
  interval: string
): Promise<BinanceKline[]> {
  let lastError:
    Error | null = null;

  const binancePair =
    getBinancePair(symbol);

  for (
    const baseUrl
    of BINANCE_ENDPOINTS
  ) {
    const controller =
      new AbortController();

    const timeout =
      setTimeout(() => {
        controller.abort();
      }, 8000);

    try {
      const url =
        new URL(
          "/api/v3/klines",
          baseUrl
        );

      url.searchParams.set(
        "symbol",
        binancePair
      );

      url.searchParams.set(
        "interval",
        interval
      );

      url.searchParams.set(
        "limit",
        "120"
      );

      const response =
        await fetch(url, {
          cache: "no-store",

          signal:
            controller.signal,

          headers: {
            Accept:
              "application/json",
          },
        });

      if (!response.ok) {
        throw new Error(
          `Binance request failed with status ${response.status}.`
        );
      }

      const result =
        await response.json();

      if (!Array.isArray(result)) {
        throw new Error(
          "Binance returned an invalid candle response."
        );
      }

      return result as BinanceKline[];
    } catch (error) {
      lastError =
        error instanceof Error
          ? error
          : new Error(
              "Unknown Binance request error."
            );
    } finally {
      clearTimeout(timeout);
    }
  }

  throw (
    lastError ??
    new Error(
      "All Binance market-data endpoints failed."
    )
  );
}

export async function GET(
  request: NextRequest
) {
  try {
    const interval =
      request.nextUrl.searchParams.get(
        "interval"
      ) ?? "1m";

    const requestedSymbol =
      (
        request.nextUrl.searchParams.get(
          "symbol"
        ) ?? "BTC"
      ).toUpperCase();

    if (
      !ALLOWED_INTERVALS.has(
        interval
      )
    ) {
      return NextResponse.json(
        {
          error:
            "Unsupported candle interval.",
        },
        {
          status: 400,

          headers: {
            "Cache-Control":
              "no-store",
          },
        }
      );
    }

    if (
      !isMarketSymbol(
        requestedSymbol
      )
    ) {
      return NextResponse.json(
        {
          error:
            "Unsupported market symbol.",
        },
        {
          status: 400,

          headers: {
            "Cache-Control":
              "no-store",
          },
        }
      );
    }

    const result =
      await fetchKlines(
        requestedSymbol,
        interval
      );

    const candles =
      result
        .map((kline) => ({
          time: Math.floor(
            Number(kline[0]) /
              1000
          ),

          open: Number(
            kline[1]
          ),

          high: Number(
            kline[2]
          ),

          low: Number(
            kline[3]
          ),

          close: Number(
            kline[4]
          ),
        }))
        .filter(
          (candle) =>
            Object.values(
              candle
            ).every((value) =>
              Number.isFinite(
                value
              )
            )
        );

    if (
      candles.length === 0
    ) {
      throw new Error(
        `No valid ${requestedSymbol} candles were returned.`
      );
    }

    return NextResponse.json(
      {
        symbol:
          requestedSymbol,

        interval,

        pair:
          `${requestedSymbol}/USDT`,

        candles,
      },
      {
        status: 200,

        headers: {
          "Cache-Control":
            "no-store, no-cache, must-revalidate",
        },
      }
    );
  } catch (error) {
    console.error(
      "Market kline route error:",
      error
    );

    return NextResponse.json(
      {
        error:
          "Unable to load market candle history.",
      },
      {
        status: 503,

        headers: {
          "Cache-Control":
            "no-store",
        },
      }
    );
  }
}