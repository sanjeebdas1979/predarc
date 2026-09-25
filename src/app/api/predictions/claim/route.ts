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

export async function POST(
  request: NextRequest
) {
  if (!localAuthConfigured()) {
    return authReply(
      {
        error:
          "Claim API is available only in the local testnet setup.",
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
        .json() as {
        predictionId?: unknown;
      };

    if (
      !isPredictionId(
        input.predictionId
      )
    ) {
      return authReply(
        {
          error:
            "Invalid claim request.",
        },
        400
      );
    }

    const { data, error } =
      await getSupabaseAdmin()
        .rpc(
          "predarc_claim_prediction_v1",
          {
            p_session_hash:
              tokenHash,
            p_prediction_id:
              input.predictionId,
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

      if (
        error.message.includes(
          "PREDICTION_NOT_SETTLED"
        )
      ) {
        return authReply(
          {
            error:
              "Settle this prediction before claiming its reward.",
          },
          409
        );
      }

      if (
        error.message.includes(
          "PREDICTION_NOT_WON"
        )
      ) {
        return authReply(
          {
            error:
              "Only winning server predictions can be claimed.",
          },
          409
        );
      }

      return authReply(
        {
          error:
            "Claim service is temporarily unavailable. Retry.",
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
      ) ||
      typeof data.balance !==
        "string" ||
      typeof data.reward !==
        "string"
    ) {
      return authReply(
        {
          error:
            "Claim service returned an unexpected result.",
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
        reward:
          data.reward,
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
          "Claim service is temporarily unavailable. Retry.",
      },
      503
    );
  }
}
