import { NextRequest } from "next/server";

import { isCommunityMarketUuid } from "@/lib/community-markets-core";
import {
  authReply,
  localAuthConfigured,
  readAuthSession,
  requestOriginAllowed,
  sessionHash,
} from "@/lib/auth-session";
import { getSupabaseAdmin } from "@/lib/supabase-admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function databaseErrorIncludes(error: unknown, code: string): boolean {
  return isRecord(error) &&
    typeof error.message === "string" &&
    error.message.includes(code);
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ predictionId: string }> }
) {
  if (!localAuthConfigured()) {
    return authReply({ error: "Community markets are not configured." }, 503);
  }

  if (!requestOriginAllowed(request)) {
    return authReply({ error: "Request origin is not allowed." }, 403);
  }

  try {
    const { predictionId } = await params;
    const tokenHash = sessionHash(request);
    const session = tokenHash ? await readAuthSession(request) : null;

    if (!tokenHash || !session) {
      return authReply({ error: "Sign in with your wallet first." }, 401);
    }

    if (!isCommunityMarketUuid(predictionId)) {
      return authReply({ error: "Invalid community prediction." }, 400);
    }

    const { data, error } = await getSupabaseAdmin()
      .rpc("predarc_claim_community_prediction_v1", {
        p_session_hash: tokenHash,
        p_prediction_id: predictionId,
      })
      .abortSignal(AbortSignal.timeout(8_000));

    if (error) {
      if (error.code === "28000") {
        return authReply({ error: "Your session ended. Sign in again." }, 401);
      }
      if (databaseErrorIncludes(error, "COMMUNITY_PREDICTION_NOT_FOUND")) {
        return authReply({ error: "Community prediction not found." }, 404);
      }
      if (databaseErrorIncludes(error, "COMMUNITY_PREDICTION_NOT_SETTLED")) {
        return authReply({ error: "This prediction is not settled yet." }, 409);
      }
      if (databaseErrorIncludes(error, "COMMUNITY_PREDICTION_NOT_WON")) {
        return authReply({ error: "This prediction has no result points." }, 409);
      }

      throw new Error("Community claim failed.");
    }

    if (
      !isRecord(data) ||
      typeof data.balance !== "string" ||
      !/^(0|[1-9][0-9]*)$/.test(data.balance) ||
      typeof data.reward !== "string" ||
      !/^(0|[1-9][0-9]*)$/.test(data.reward)
    ) {
      throw new Error("Unexpected community claim response.");
    }

    return authReply({
      claimed: true,
      balance: data.balance,
      reward: data.reward,
      replayed: data.replayed === true,
    });
  } catch (error) {
    console.error("Community prediction claim failed", error);
    return authReply(
      { error: "Community result points are temporarily unavailable." },
      503
    );
  }
}
