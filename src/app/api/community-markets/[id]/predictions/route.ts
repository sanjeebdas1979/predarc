import { NextRequest } from "next/server";

import {
  communityForecastIdFromRequestId,
  communityPriceToScaledBigInt,
  isCommunityForecastId,
  isCommunityMarketDirection,
  isCommunityMarketUuid,
  isCommunityTransactionHash,
  normalizeCommunityPrice,
} from "@/lib/community-markets-core";
import {
  CommunityForecastVerificationError,
  verifyCommunityForecastTransaction,
} from "@/lib/community-markets-server";
import {
  authChainId,
  authReply,
  localAuthConfigured,
  readAuthSession,
  requestOriginAllowed,
  sessionHash,
} from "@/lib/auth-session";
import { getSupabaseAdmin } from "@/lib/supabase-admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type PredictionInput = {
  requestId?: unknown;
  direction?: unknown;
  points?: unknown;
  transactionHash?: unknown;
  onchainForecastId?: unknown;
};

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
  { params }: { params: Promise<{ id: string }> }
) {
  if (!localAuthConfigured()) {
    return authReply({ error: "Community markets are not configured." }, 503);
  }

  if (!requestOriginAllowed(request)) {
    return authReply({ error: "Request origin is not allowed." }, 403);
  }

  try {
    const { id: marketId } = await params;
    const tokenHash = sessionHash(request);
    const session = tokenHash ? await readAuthSession(request) : null;

    if (!tokenHash || !session) {
      return authReply({ error: "Sign in with your wallet first." }, 401);
    }

    const input = (await request.json()) as PredictionInput;
    const points = input.points;
    const expectedForecastId =
      typeof input.requestId === "string"
        ? communityForecastIdFromRequestId(input.requestId)
        : null;

    if (
      !isCommunityMarketUuid(marketId) ||
      !isCommunityMarketUuid(input.requestId) ||
      !isCommunityMarketDirection(input.direction) ||
      typeof points !== "number" ||
      !Number.isInteger(points) ||
      points < 10 ||
      points > 1_000_000_000 ||
      !isCommunityTransactionHash(input.transactionHash) ||
      !isCommunityForecastId(input.onchainForecastId) ||
      expectedForecastId === null ||
      input.onchainForecastId !== expectedForecastId.toString()
    ) {
      return authReply({ error: "Invalid community prediction request." }, 400);
    }

    const db = getSupabaseAdmin();
    const { data: existing, error: existingError } = await db
      .from("predarc_community_predictions")
      .select(
        "id,market_id,direction,points,onchain_forecast_id,transaction_hash"
      )
      .eq("chain_id", session.chainId)
      .eq("wallet", session.wallet)
      .eq("request_id", input.requestId)
      .maybeSingle();

    if (existingError) {
      throw new Error("Community prediction replay lookup failed.");
    }
    if (
      existing &&
      (existing.market_id !== marketId ||
        existing.direction !== input.direction ||
        Number(existing.points) !== points ||
        existing.onchain_forecast_id !== input.onchainForecastId ||
        existing.transaction_hash !== input.transactionHash.toLowerCase())
    ) {
      return authReply({ error: "This prediction request was already used." }, 409);
    }

    const { data: market, error: marketError } = await db
      .from("predarc_community_markets")
      .select("id,target_price,duration_seconds,status,closes_at")
      .eq("id", marketId)
      .eq("chain_id", authChainId)
      .maybeSingle();

    if (marketError) throw new Error("Community market lookup failed.");
    if (!market) return authReply({ error: "Community market not found." }, 404);
    if (
      !existing &&
      (market.status !== "open" || Date.parse(market.closes_at) <= Date.now())
    ) {
      return authReply({ error: "This community market is closed." }, 409);
    }

    const targetPrice = normalizeCommunityPrice(String(market.target_price));
    const scaledTarget = targetPrice
      ? communityPriceToScaledBigInt(targetPrice)
      : null;

    if (!targetPrice || scaledTarget === null) {
      throw new Error("Community market target is invalid.");
    }

    if (!existing) {
      try {
        await verifyCommunityForecastTransaction({
          wallet: session.wallet,
          transactionHash: input.transactionHash,
          forecastId: expectedForecastId,
          direction: input.direction === "higher" ? 0 : 1,
          durationSeconds: Number(market.duration_seconds),
          points: BigInt(points),
          targetPrice: scaledTarget,
        });
      } catch (error) {
        if (error instanceof CommunityForecastVerificationError) {
          return authReply({ error: error.message }, 422);
        }
        throw error;
      }
    }

    const { data, error } = await db
      .rpc("predarc_submit_community_prediction_v1", {
        p_session_hash: tokenHash,
        p_request_id: input.requestId,
        p_market_id: marketId,
        p_direction: input.direction,
        p_points: points,
        p_onchain_forecast_id: input.onchainForecastId,
        p_transaction_hash: input.transactionHash.toLowerCase(),
      })
      .abortSignal(AbortSignal.timeout(8_000));

    if (error) {
      if (error.code === "28000") {
        return authReply({ error: "Your session ended. Sign in again." }, 401);
      }
      if (databaseErrorIncludes(error, "COMMUNITY_MARKET_NOT_FOUND")) {
        return authReply({ error: "Community market not found." }, 404);
      }
      if (databaseErrorIncludes(error, "COMMUNITY_MARKET_CLOSED")) {
        return authReply({ error: "This community market is closed." }, 409);
      }
      if (databaseErrorIncludes(error, "INSUFFICIENT_POINTS")) {
        return authReply({ error: "Not enough server demo points." }, 409);
      }
      if (databaseErrorIncludes(error, "COMMUNITY_PREDICTION_EXISTS")) {
        return authReply({ error: "You already joined this market." }, 409);
      }
      if (databaseErrorIncludes(error, "REQUEST_ID_CONFLICT")) {
        return authReply({ error: "This prediction request was already used." }, 409);
      }

      throw new Error("Community prediction recording failed.");
    }

    if (
      !isRecord(data) ||
      typeof data.balance !== "string" ||
      !/^(0|[1-9][0-9]*)$/.test(data.balance) ||
      !isRecord(data.prediction) ||
      !isCommunityMarketUuid(data.prediction.id)
    ) {
      throw new Error("Unexpected community prediction response.");
    }

    return authReply({
      authenticated: true,
      balance: data.balance,
      predictionId: data.prediction.id,
      replayed: data.replayed === true,
    });
  } catch (error) {
    console.error("Community prediction submission failed", error);
    return authReply(
      { error: "Community prediction service is temporarily unavailable." },
      503
    );
  }
}
