import { NextRequest } from "next/server";

import {
  isCommunityMarketAsset,
  isCommunityMarketUuid,
} from "@/lib/community-markets-core";
import {
  CommunityMarketPriceNotReadyError,
  fetchCommunitySettlementPrice,
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

    if (!isCommunityMarketUuid(marketId)) {
      return authReply({ error: "Invalid community market." }, 400);
    }

    const db = getSupabaseAdmin();
    const { data: market, error: marketError } = await db
      .from("predarc_community_markets")
      .select("id,asset,closes_at,status,outcome,settlement_price")
      .eq("id", marketId)
      .eq("chain_id", authChainId)
      .maybeSingle();

    if (marketError) throw new Error("Community market lookup failed.");
    if (!market) return authReply({ error: "Community market not found." }, 404);

    if (market.status === "settled") {
      return authReply({
        settled: true,
        replayed: true,
        outcome: market.outcome,
        settlementPrice:
          market.settlement_price === null
            ? null
            : String(market.settlement_price),
      });
    }

    if (!isCommunityMarketAsset(market.asset)) {
      throw new Error("Community market asset is invalid.");
    }

    let quote;

    try {
      quote = await fetchCommunitySettlementPrice(
        market.asset,
        market.closes_at
      );
    } catch (error) {
      if (error instanceof CommunityMarketPriceNotReadyError) {
        return authReply(
          { error: "The finalized settlement candle is not ready yet." },
          409
        );
      }
      throw error;
    }

    const { data, error } = await db
      .rpc("predarc_settle_community_market_v1", {
        p_session_hash: tokenHash,
        p_market_id: marketId,
        p_exit_price: quote.price,
        p_price_source: quote.source,
        p_exit_observed_at: quote.observedAt,
      })
      .abortSignal(AbortSignal.timeout(8_000));

    if (error) {
      if (error.code === "28000") {
        return authReply({ error: "Your session ended. Sign in again." }, 401);
      }
      if (databaseErrorIncludes(error, "COMMUNITY_MARKET_NOT_FOUND")) {
        return authReply({ error: "Community market not found." }, 404);
      }
      if (databaseErrorIncludes(error, "COMMUNITY_MARKET_NOT_CLOSED")) {
        return authReply({ error: "This community market is still open." }, 409);
      }
      if (databaseErrorIncludes(error, "INVALID_COMMUNITY_SETTLEMENT_PRICE")) {
        return authReply({ error: "Settlement price was not accepted. Retry." }, 409);
      }

      throw new Error("Community market settlement failed.");
    }

    if (
      !isRecord(data) ||
      !isRecord(data.market) ||
      !isCommunityMarketUuid(data.market.id) ||
      (data.market.outcome !== "higher" &&
        data.market.outcome !== "lower" &&
        data.market.outcome !== "void")
    ) {
      throw new Error("Unexpected community settlement response.");
    }

    return authReply({
      settled: true,
      replayed: data.replayed === true,
      outcome: data.market.outcome,
      settlementPrice: String(data.market.settlement_price),
    });
  } catch (error) {
    console.error("Community market settlement failed", error);
    return authReply(
      { error: "Community settlement service is temporarily unavailable." },
      503
    );
  }
}
