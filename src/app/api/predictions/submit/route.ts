import { NextRequest } from "next/server";
import {
  authReply,
  localAuthConfigured,
  readAuthSession,
  sessionHash,
} from "@/lib/auth-session";
import {
  verifyCommunityForecastTransaction,
} from "@/lib/community-markets-server";
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
  entryPrice?: unknown;
  forecastId?: unknown;
  transactionHash?: unknown;
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

export async function POST(
  request: NextRequest
) {
  if (
    !localAuthConfigured()
  ) {
    return authReply(
      {
        error:
          "Prediction API is not configured.",
      },
      503
    );
  }

  const origin =
    process.env.PREDARC_APP_ORIGIN;

  const allowedOrigins = new Set([
    origin,
  ]);

  if (origin === "https://predarc.xyz") {
    allowedOrigins.add("https://www.predarc.xyz");
  }

  if (origin === "https://www.predarc.xyz") {
    allowedOrigins.add("https://predarc.xyz");
  }

  if (
    !allowedOrigins.has(request.nextUrl.origin) ||
    !allowedOrigins.has(request.headers.get("origin") ?? "")
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
      ) ||
      typeof input.entryPrice !==
        "number" ||
      !Number.isFinite(
        input.entryPrice
      ) ||
      input.entryPrice <= 0 ||
      input.entryPrice > 1_000_000_000_000 ||
      typeof input.forecastId !==
        "string" ||
      !/^[1-9][0-9]{0,77}$/.test(
        input.forecastId
      ) ||
      typeof input.transactionHash !==
        "string" ||
      !/^0x[0-9a-fA-F]{64}$/.test(
        input.transactionHash
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

    const scaledEntryPrice =
      BigInt(
        Math.round(
          input.entryPrice * 1_000_000
        )
      );

    const canonicalEntryPrice =
      Number(
        scaledEntryPrice
      ) / 1_000_000;

    try {
      await verifyCommunityForecastTransaction({
        wallet:
          session.wallet,
        transactionHash:
          input.transactionHash as `0x${string}`,
        forecastId:
          BigInt(
            input.forecastId
          ),
        direction:
          input.direction === "higher"
            ? 0
            : 1,
        durationSeconds:
          input.durationSeconds,
        points:
          BigInt(
            input.points
          ),
        targetPrice:
          scaledEntryPrice,
        chainId:
          session.chainId,
      });
    } catch {
      return authReply(
        {
          error:
            "The confirmed transaction does not match this prediction.",
        },
        422
      );
    }

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
              canonicalEntryPrice,
            p_price_source:
              "binance",
            p_entry_observed_at:
              new Date()
                .toISOString(),
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
          "PREDICTION_SLOT_ACTIVE"
        )
      ) {
        return authReply(
          {
            error:
              "This market and timeframe already has an active prediction.",
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
          session.chainId,
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
