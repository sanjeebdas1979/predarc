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

type Direction =
  | "higher"
  | "lower";

type SubmitPredictionInput = {
  requestId?: unknown;
  market?: unknown;
  direction?: unknown;
  points?: unknown;
  durationSeconds?: unknown;
};

const markets =
  new Set<Market>([
    "BTC",
    "ETH",
    "BNB",
    "SOL",
    "XRP",
  ]);

const directions =
  new Set<Direction>([
    "higher",
    "lower",
  ]);

const durations =
  new Set([
    60,
    300,
    900,
            3600,
  ]);

const binanceEndpoints = [
  "https://data-api.binance.vision",
  "https://api.binance.com",
  "https://api-gcp.binance.com",
];

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

function isDirection(
  value: unknown
): value is Direction {
  return (
    typeof value === "string" &&
    directions.has(
      value as Direction
    )
  );
}

function isRequestId(
  value: unknown
): value is string {
  return (
    typeof value === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      value
    )
  );
}

async function fetchBinancePrice(
  market: Market
): Promise<{
  price: number;
  observedAt: string;
}> {
  let lastError:
    Error | null = null;

  for (
    const baseUrl of binanceEndpoints
  ) {
    const controller =
      new AbortController();

    const timeout =
      setTimeout(
        () => controller.abort(),
        8000
      );

    try {
      const url =
        new URL(
          "/api/v3/ticker/price",
          baseUrl
        );

      url.searchParams.set(
        "symbol",
        `${market}USDT`
      );

      const response =
        await fetch(
          url,
          {
            cache: "no-store",
            signal:
              controller.signal,
            headers: {
              Accept:
                "application/json",
            },
          }
        );

      if (!response.ok) {
        throw new Error(
          `Binance returned HTTP ${response.status}.`
        );
      }

      const data =
        await response.json();

      const price =
        Number(
          data?.price
        );

      if (
        !Number.isFinite(
          price
        ) ||
        price <= 0
      ) {
        throw new Error(
          "Binance returned an invalid price."
        );
      }

      return {
        price,
        observedAt:
          new Date()
            .toISOString(),
      };
    } catch (error) {
      lastError =
        error instanceof Error
          ? error
          : new Error(
              "Unknown Binance price error."
            );
    } finally {
      clearTimeout(
        timeout
      );
    }
  }

  throw (
    lastError ??
    new Error(
      "All Binance price endpoints failed."
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
          "Prediction API is available only in the local testnet setup.",
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
        .json() as SubmitPredictionInput;

    if (
      !isRequestId(
        input.requestId
      ) ||
      !isMarket(
        input.market
      ) ||
      !isDirection(
        input.direction
      ) ||
      typeof input.points !==
        "number" ||
      !Number.isInteger(
        input.points
      ) ||
      input.points < 10 ||
      input.points > 1_000_000_000 ||
      typeof input.durationSeconds !==
        "number" ||
      !Number.isInteger(
        input.durationSeconds
      ) ||
      !durations.has(
        input.durationSeconds
      )
    ) {
      return authReply(
        {
          error:
            "Invalid prediction request.",
        },
        400
      );
    }

    const quote =
      await fetchBinancePrice(
        input.market
      );

    const { data, error } =
      await getSupabaseAdmin()
        .rpc(
          "predarc_submit_prediction_v1",
          {
            p_session_hash:
              tokenHash,
            p_request_id:
              input.requestId,
            p_market:
              input.market,
            p_direction:
              input.direction,
            p_points:
              input.points,
            p_duration_seconds:
              input.durationSeconds,
            p_entry_price:
              quote.price,
            p_price_source:
              "binance",
            p_entry_observed_at:
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
          "INSUFFICIENT_POINTS"
        )
      ) {
        return authReply(
          {
            error:
              "Not enough server demo points.",
          },
          409
        );
      }

      if (
        error.message.includes(
          "INVALID_OR_STALE_PRICE"
        )
      ) {
        return authReply(
          {
            error:
              "Fresh market price is temporarily unavailable. Retry.",
          },
          503
        );
      }

      return authReply(
        {
          error:
            "Prediction service is temporarily unavailable. Retry.",
        },
        503
      );
    }

    if (
      !data ||
      typeof data !== "object" ||
      Array.isArray(data) ||
      typeof data.balance !==
        "string" ||
      !/^(0|[1-9][0-9]*)$/.test(
        data.balance
      ) ||
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
            "Prediction service returned an unexpected result.",
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
        balance:
          data.balance,
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
          "Prediction service is temporarily unavailable. Retry.",
      },
      503
    );
  }
}
