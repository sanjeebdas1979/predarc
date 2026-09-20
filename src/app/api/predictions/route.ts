import { NextRequest } from "next/server";
import {
  authReply,
  localAuthConfigured,
  readAuthSession,
} from "@/lib/auth-session";
import { getSupabaseAdmin } from "@/lib/supabase-admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  request: NextRequest
) {
  if (
    !localAuthConfigured()
  ) {
    return authReply(
      {
        error:
          "Prediction history API is available only in the local testnet setup.",
      },
      503
    );
  }

  const origin =
    process.env
      .PREDARC_APP_ORIGIN;

  const requestOrigin =
    request.headers.get(
      "origin"
    );

  if (
    request.nextUrl.origin !==
      origin ||
    (requestOrigin &&
      requestOrigin !== origin)
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

    const { data, error } =
      await getSupabaseAdmin()
        .from(
          "predarc_predictions"
        )
        .select(
          [
            "id",
            "market",
            "direction",
            "points",
            "duration_seconds",
            "status",
            "entry_price",
            "accepted_at",
            "closes_at",
          ].join(",")
        )
        .eq(
          "chain_id",
          session.chainId
        )
        .eq(
          "wallet",
          session.wallet
        )
        .order(
          "accepted_at",
          {
            ascending:
              false,
          }
        )
        .limit(20)
        .abortSignal(
          AbortSignal.timeout(
            8000
          )
        );

    if (error) {
      return authReply(
        {
          error:
            "Prediction history is temporarily unavailable. Retry.",
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
        predictions:
          data ?? [],
      }
    );
  } catch {
    return authReply(
      {
        error:
          "Prediction history is temporarily unavailable. Retry.",
      },
      503
    );
  }
}
