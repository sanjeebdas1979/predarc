import { NextRequest } from "next/server";
import { verifyMessage, type Address, type Hex } from "viem";

import {
  buildCommunityMarketCreationMessage,
  communityMarketResolutionTimestamp,
  communityTargetIsReasonable,
  isCommunityMarketAsset,
  isCommunityMarketDuration,
  isCommunityMarketUuid,
  isCommunitySignature,
  normalizeCommunityPrice,
} from "@/lib/community-markets-core";
import { fetchCommunitySpotPrice } from "@/lib/community-markets-server";
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

type MarketRow = {
  id: string;
  creator_wallet: string;
  asset: string;
  target_price: string | number;
  reference_price: string | number;
  duration_seconds: number;
  created_at: string;
  closes_at: string;
  status: string;
  outcome: string | null;
  settlement_price: string | number | null;
  settled_at: string | null;
};

type PredictionRow = {
  id: string;
  market_id: string;
  wallet: string;
  direction: string;
  points: string | number;
  status: string;
  transaction_hash: string;
  onchain_forecast_id: string;
};

type CreateMarketInput = {
  requestId?: unknown;
  asset?: unknown;
  targetPrice?: unknown;
  durationSeconds?: unknown;
  signature?: unknown;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function databaseErrorIncludes(error: unknown, code: string): boolean {
  return isRecord(error) &&
    typeof error.message === "string" &&
    error.message.includes(code);
}

export async function GET(request: NextRequest) {
  if (!localAuthConfigured()) {
    return authReply({ error: "Community markets are not configured." }, 503);
  }

  if (!requestOriginAllowed(request)) {
    return authReply({ error: "Request origin is not allowed." }, 403);
  }

  try {
    const tokenHash = sessionHash(request);
    const session = tokenHash ? await readAuthSession(request) : null;
    const db = getSupabaseAdmin();
    const { data: marketData, error: marketError } = await db
      .from("predarc_community_markets")
      .select(
        "id,creator_wallet,asset,target_price,reference_price,duration_seconds,created_at,closes_at,status,outcome,settlement_price,settled_at"
      )
      .eq("chain_id", authChainId)
      .order("created_at", { ascending: false })
      .limit(50);

    if (marketError) throw new Error("Community market lookup failed.");

    const marketRows = (marketData ?? []) as MarketRow[];
    const marketIds = marketRows.map((market) => market.id);
    let predictionRows: PredictionRow[] = [];

    if (marketIds.length > 0) {
      const { data, error } = await db
        .from("predarc_community_predictions")
        .select(
          "id,market_id,wallet,direction,points,status,transaction_hash,onchain_forecast_id"
        )
        .eq("chain_id", authChainId)
        .in("market_id", marketIds);

      if (error) throw new Error("Community prediction lookup failed.");
      predictionRows = (data ?? []) as PredictionRow[];
    }

    const predictionsByMarket = new Map<string, PredictionRow[]>();

    for (const prediction of predictionRows) {
      const group = predictionsByMarket.get(prediction.market_id) ?? [];
      group.push(prediction);
      predictionsByMarket.set(prediction.market_id, group);
    }

    const currentWallet = session?.wallet.toLowerCase() ?? null;
    const ownPredictions = currentWallet
      ? predictionRows.filter(
          (prediction) => prediction.wallet.toLowerCase() === currentWallet
        )
      : [];
    const claimedPredictionIds = new Set<string>();

    if (currentWallet && ownPredictions.length > 0) {
      const sourceIds = ownPredictions.flatMap((prediction) => [
        `community_claim:${prediction.id}`,
        `community_refund:${prediction.id}`,
      ]);
      const { data, error } = await db
        .from("predarc_points_ledger")
        .select("source_id")
        .eq("chain_id", authChainId)
        .eq("wallet", currentWallet)
        .in("source_id", sourceIds);

      if (error) throw new Error("Community claim lookup failed.");

      for (const row of data ?? []) {
        const sourceId = String(row.source_id ?? "");
        const separator = sourceId.indexOf(":");
        if (separator >= 0) claimedPredictionIds.add(sourceId.slice(separator + 1));
      }
    }

    const now = Date.now();
    const markets = marketRows.map((market) => {
      const predictions = predictionsByMarket.get(market.id) ?? [];
      const ownPrediction = currentWallet
        ? predictions.find(
            (prediction) => prediction.wallet.toLowerCase() === currentWallet
          ) ?? null
        : null;
      const closesAtMs = Date.parse(market.closes_at);
      const resolutionAtMs = communityMarketResolutionTimestamp(closesAtMs);
      const claimed = ownPrediction
        ? claimedPredictionIds.has(ownPrediction.id)
        : false;
      const higherPoints = predictions
        .filter((prediction) => prediction.direction === "higher")
        .reduce((total, prediction) => total + BigInt(prediction.points), 0n);
      const lowerPoints = predictions
        .filter((prediction) => prediction.direction === "lower")
        .reduce((total, prediction) => total + BigInt(prediction.points), 0n);

      return {
        id: market.id,
        asset: market.asset,
        creatorWallet: market.creator_wallet.toLowerCase(),
        targetPrice: String(market.target_price),
        referencePrice: String(market.reference_price),
        durationSeconds: Number(market.duration_seconds),
        createdAt: market.created_at,
        closesAt: market.closes_at,
        resolutionAt: new Date(resolutionAtMs ?? closesAtMs).toISOString(),
        status:
          market.status === "settled"
            ? "settled"
            : closesAtMs > now
              ? "open"
              : "awaiting-settlement",
        outcome: market.outcome,
        settlementPrice:
          market.settlement_price === null
            ? null
            : String(market.settlement_price),
        settledAt: market.settled_at,
        participantCount: predictions.length,
        higherPoints: higherPoints.toString(),
        lowerPoints: lowerPoints.toString(),
        userPrediction: ownPrediction
          ? {
              id: ownPrediction.id,
              direction: ownPrediction.direction,
              points: String(ownPrediction.points),
              status: ownPrediction.status,
              claimed,
              canClaim:
                !claimed &&
                (ownPrediction.status === "won" ||
                  ownPrediction.status === "void"),
              transactionHash: ownPrediction.transaction_hash,
              onchainForecastId: ownPrediction.onchain_forecast_id,
            }
          : null,
      };
    });

    return authReply({ markets });
  } catch (error) {
    console.error("Community market list failed", error);
    return authReply({ error: "Unable to load community markets." }, 503);
  }
}

export async function POST(request: NextRequest) {
  if (!localAuthConfigured()) {
    return authReply({ error: "Community markets are not configured." }, 503);
  }

  if (!requestOriginAllowed(request)) {
    return authReply({ error: "Request origin is not allowed." }, 403);
  }

  try {
    const tokenHash = sessionHash(request);
    const session = tokenHash ? await readAuthSession(request) : null;

    if (!tokenHash || !session) {
      return authReply({ error: "Sign in with your wallet first." }, 401);
    }

    const input = (await request.json()) as CreateMarketInput;
    const targetPrice = normalizeCommunityPrice(input.targetPrice);

    if (
      !isCommunityMarketUuid(input.requestId) ||
      !isCommunityMarketAsset(input.asset) ||
      !targetPrice ||
      !isCommunityMarketDuration(input.durationSeconds) ||
      !isCommunitySignature(input.signature)
    ) {
      return authReply({ error: "Invalid community market request." }, 400);
    }

    const message = buildCommunityMarketCreationMessage({
      requestId: input.requestId,
      wallet: session.wallet,
      chainId: session.chainId,
      asset: input.asset,
      targetPrice,
      durationSeconds: input.durationSeconds,
    });
    let signatureValid = false;

    try {
      signatureValid = await verifyMessage({
        address: session.wallet as Address,
        message,
        signature: input.signature as Hex,
      });
    } catch {
      signatureValid = false;
    }

    if (!signatureValid) {
      return authReply(
        { error: "Market signature does not match the signed-in wallet." },
        401
      );
    }

    const db = getSupabaseAdmin();
    const { data: existing, error: existingError } = await db
      .from("predarc_community_markets")
      .select("id,asset,target_price,duration_seconds")
      .eq("chain_id", session.chainId)
      .eq("creator_wallet", session.wallet)
      .eq("request_id", input.requestId)
      .maybeSingle();

    if (existingError) throw new Error("Community market replay lookup failed.");

    if (existing) {
      if (
        existing.asset !== input.asset ||
        normalizeCommunityPrice(String(existing.target_price)) !== targetPrice ||
        Number(existing.duration_seconds) !== input.durationSeconds
      ) {
        return authReply({ error: "This market request was already used." }, 409);
      }

      return authReply({
        authenticated: true,
        marketId: existing.id,
        replayed: true,
      });
    }

    const quote = await fetchCommunitySpotPrice(input.asset);

    if (!communityTargetIsReasonable(targetPrice, quote.price)) {
      return authReply(
        { error: "Choose a target within 50% to 150% of the live price." },
        400
      );
    }

    const { data, error } = await db
      .rpc("predarc_create_community_market_v1", {
        p_session_hash: tokenHash,
        p_request_id: input.requestId,
        p_asset: input.asset,
        p_target_price: targetPrice,
        p_duration_seconds: input.durationSeconds,
        p_reference_price: quote.price,
        p_price_source: quote.source,
        p_reference_observed_at: quote.observedAt,
      })
      .abortSignal(AbortSignal.timeout(8_000));

    if (error) {
      if (error.code === "28000") {
        return authReply({ error: "Your session ended. Sign in again." }, 401);
      }
      if (databaseErrorIncludes(error, "COMMUNITY_MARKET_OPEN_LIMIT")) {
        return authReply(
          { error: "Settle an open market before creating another (maximum 3)." },
          429
        );
      }
      if (databaseErrorIncludes(error, "COMMUNITY_MARKET_RATE_LIMIT")) {
        return authReply(
          { error: "You can create up to 5 community markets per hour." },
          429
        );
      }
      if (databaseErrorIncludes(error, "REQUEST_ID_CONFLICT")) {
        return authReply({ error: "This market request was already used." }, 409);
      }
      if (databaseErrorIncludes(error, "INVALID_COMMUNITY_TARGET")) {
        return authReply({ error: "The market price changed. Review your target." }, 409);
      }

      throw new Error("Community market creation failed.");
    }

    if (
      !isRecord(data) ||
      !isRecord(data.market) ||
      !isCommunityMarketUuid(data.market.id)
    ) {
      throw new Error("Unexpected community market response.");
    }

    return authReply(
      {
        authenticated: true,
        marketId: data.market.id,
        replayed: data.replayed === true,
      },
      data.replayed === true ? 200 : 201
    );
  } catch (error) {
    console.error("Community market creation failed", error);
    return authReply(
      { error: "Community market service is temporarily unavailable." },
      503
    );
  }
}
