import { NextRequest } from "next/server";
import {
  authChainId,
  authReply,
  localAuthConfigured,
  readAuthSession,
  sessionHash,
} from "@/lib/auth-session";
import { getSupabaseAdmin } from "@/lib/supabase-admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Market =
  | "BTC"
  | "ETH"
  | "BNB"
  | "SOL"
  | "XRP";

const markets =
  new Set<Market>([
    "BTC",
    "ETH",
    "BNB",
    "SOL",
    "XRP",
  ]);

const binanceEndpoints = [
  "https://data-api.binance.vision",
  "https://api.binance.com",
  "https://api-gcp.binance.com",
];

function isPredictionId(
  value: unknown
): value is string {
  return (
    typeof value === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      value
    )
  );
}

function isMarket(
  value: unknown
): value is Market {
  return (
    typeof value === "string" &&
    markets.has(
      value as Market
    )
  );
}

async function fetchBinanceClosePrice(
  market: Market,
  closesAt: string
): Promise<{
  price: number;
  observedAt: string;
}> {
  const closeTime = Date.parse(closesAt);

  if (!Number.isFinite(closeTime)) {
    throw new Error("Prediction close time is invalid.");
  }

  const candleStart =
    Math.floor(closeTime / 60000) * 60000;

  let lastError: Error | null = null;

  for (const baseUrl of binanceEndpoints) {
    const controller = new AbortController();
    const timeout = setTimeout(
      () => controller.abort(),
      8000
    );

    try {
      const url = new URL(
        "/api/v3/klines",
        baseUrl
      );

      url.searchParams.set(
        "symbol",
        `${market}USDT`
      );
      url.searchParams.set(
        "interval",
        "1m"
      );
      url.searchParams.set(
        "startTime",
        String(candleStart)
      );
      url.searchParams.set(
        "limit",
        "1"
      );

      const response = await fetch(url, {
        cache: "no-store",
        signal: controller.signal,
        headers: {
          Accept: "application/json",
        },
      });

      if (!response.ok) {
        throw new Error(
          `Binance returned HTTP ${response.status}.`
        );
      }

      const data = await response.json();
      const price = Number(data?.[0]?.[4]);

      if (!Number.isFinite(price) || price <= 0) {
        throw new Error(
          "Binance returned an invalid historical price."
        );
      }

      return {
        price,
        observedAt: closesAt,
      };
    } catch (error) {
      lastError =
        error instanceof Error
          ? error
          : new Error(
              "Unknown Binance historical price error."
            );
    } finally {
      clearTimeout(timeout);
    }
  }

  throw (
    lastError ??
    new Error(
      "All Binance historical price endpoints failed."
    )
  );
}
export async function POST(
  request: NextRequest
) {
  if (
    !localAuthConfigured()
  ) {
    return authReply(
      {
        error:
          "Settlement API is available only in the local testnet setup.",
      },
      503
    );
  }

  const origin =
    process.env
      .PREDARC_APP_ORIGIN;

  if (
    request.headers.get(
      "origin"
    ) !== origin ||
    request.nextUrl.origin !==
      origin
  ) {
    return authReply(
      {
        error:
          "Request origin is not allowed.",
      },
      403
    );
  }

  try {
    const tokenHash =
      sessionHash(
        request
      );

    if (!tokenHash) {
      return authReply(
        {
          error:
            "Sign in with your wallet first.",
        },
        401
      );
    }

    const session =
      await readAuthSession(
        request
      );

    if (!session) {
      return authReply(
        {
          error:
            "Your session has ended. Sign in again.",
        },
        401
      );
    }

    const input =
      await request
        .json() as {
        predictionId?: unknown;
        market?: unknown;
      };

    if (
      !isPredictionId(
        input.predictionId
      ) ||
      !isMarket(
        input.market
      )
    ) {
      return authReply(
        {
          error:
            "Invalid settlement request.",
        },
        400
      );
    }
    const { data: predictionRecord, error: predictionLookupError } =
      await getSupabaseAdmin()
        .from("predarc_predictions")
        .select("closes_at")
        .eq("id", input.predictionId)
        .eq("wallet", session.wallet.toLowerCase())
        .maybeSingle();

    if (predictionLookupError) {
      throw new Error("Prediction close time lookup failed");
    }

    if (!predictionRecord?.closes_at) {
      return authReply(
        {
          error:
            "Prediction was not found for this wallet.",
        },
        404
      );
    }

    const quote =
      await fetchBinanceClosePrice(
        input.market,
        String(predictionRecord.closes_at)
      );

    const { data, error } =
      await getSupabaseAdmin()
        .rpc(
          "predarc_settle_prediction_v1",
          {
            p_session_hash:
              tokenHash,
            p_prediction_id:
              input.predictionId,
            p_exit_price:
              quote.price,
            p_price_source:
              "binance",
            p_exit_observed_at:
              quote.observedAt,
          }
        )
        .abortSignal(
          AbortSignal.timeout(
            8000
          )
        );

    if (error) {
      if (
        error.code === "28000"
      ) {
        return authReply(
          {
            error:
              "Your session has ended. Sign in again.",
          },
          401
        );
      }

      if (
        error.message.includes(
          "PREDICTION_NOT_CLOSED"
        )
      ) {
        return authReply(
          {
            error:
              "Prediction is not closed yet.",
          },
          409
        );
      }

      if (
        error.message.includes(
          "PREDICTION_NOT_FOUND"
        )
      ) {
        return authReply(
          {
            error:
              "Prediction was not found for this wallet.",
          },
          404
        );
      }

      return authReply(
        {
          error:
            "Settlement service is temporarily unavailable. Retry.",
        },
        503
      );
    }

    if (
      !data ||
      typeof data !== "object" ||
      Array.isArray(data) ||
      !data.prediction ||
      typeof data.prediction !==
        "object" ||
      Array.isArray(
        data.prediction
      )
    ) {
      return authReply(
        {
          error:
            "Settlement service returned an unexpected result.",
        },
        503
      );
    }

    return authReply(
      {
        authenticated: true,
        wallet:
          session.wallet,
        chainId:
          authChainId,
        prediction:
          data.prediction,
        replayed:
          data.replayed ===
          true,
      }
    );
  } catch {
    return authReply(
      {
        error:
          "Settlement service is temporarily unavailable. Retry.",
      },
      503
    );
  }
}




