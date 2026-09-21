import { NextRequest } from "next/server";
import {
  authReply,
  localAuthConfigured,
  readAuthSession,
} from "@/lib/auth-session";
import { getSupabaseAdmin } from "@/lib/supabase-admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type PredictionRow = {
  id: string;
  market: string;
  direction: string;
  points: number | string;
  duration_seconds:
    number | string;
  status: string;
  entry_price:
    number | string;
  accepted_at: string;
  closes_at: string;
};

type ClaimRow = {
  source_id: string;
};

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

    const predictionRows =
      (data ??
        []) as unknown as PredictionRow[];

    const claimSourceIds =
      predictionRows.map(
        (
          prediction
        ) =>
          `claim:${prediction.id}`
      );

    let claimedSourceIds =
      new Set<string>();

    if (
      claimSourceIds.length > 0
    ) {
      const {
        data:
          claimRows,
        error:
          claimError,
      } =
        await getSupabaseAdmin()
          .from(
            "predarc_points_ledger"
          )
          .select(
            "source_id"
          )
          .eq(
            "chain_id",
            session.chainId
          )
          .eq(
            "wallet",
            session.wallet
          )
          .eq(
            "kind",
            "claim_credit"
          )
          .in(
            "source_id",
            claimSourceIds
          )
          .abortSignal(
            AbortSignal.timeout(
              8000
            )
          );

      if (claimError) {
        return authReply(
          {
            error:
              "Prediction history is temporarily unavailable. Retry.",
          },
          503
        );
      }

      claimedSourceIds =
        new Set(
          ((claimRows ??
            []) as ClaimRow[])
            .map(
              (
                row
              ) =>
                typeof row.source_id ===
                "string"
                  ? row.source_id
                  : ""
            )
            .filter(Boolean)
        );
    }

    const predictions =
      predictionRows.map(
        (
          prediction
        ) => ({
          ...prediction,
          claimed:
            claimedSourceIds.has(
              `claim:${prediction.id}`
            ),
        })
      );

    return authReply(
      {
        authenticated: true,
        wallet:
          session.wallet,
        chainId:
          session.chainId,
        predictions:
          predictions,
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
