import { NextRequest } from "next/server";

import {
  isAgentAutomationUuid,
  normalizeAgentPredictionInput,
} from "@/lib/agent-automation-core";
import {
  hashAgentApiToken,
  readAgentBearerToken,
} from "@/lib/agent-automation-server";
import { authReply, localAuthConfigured } from "@/lib/auth-session";
import { fetchCommunitySpotPrice } from "@/lib/community-markets-server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function databaseErrorIncludes(error: unknown, code: string): boolean {
  return (
    isRecord(error) &&
    typeof error.message === "string" &&
    error.message.includes(code)
  );
}

function whitelistedPredictionResult(value: unknown) {
  if (!isRecord(value) || !isRecord(value.prediction)) return null;

  const prediction = value.prediction;
  const balance = String(value.balance ?? "");
  const id = String(prediction.id ?? "");
  const acceptedAt = String(prediction.acceptedAt ?? "");
  const closesAt = String(prediction.closesAt ?? "");
  const entryPrice = String(prediction.entryPrice ?? "");

  if (
    !/^(0|[1-9][0-9]*)$/.test(balance) ||
    !isAgentAutomationUuid(id) ||
    !Number.isFinite(Date.parse(acceptedAt)) ||
    !Number.isFinite(Date.parse(closesAt)) ||
    !/^(?:0|[1-9][0-9]*)(?:\.[0-9]+)?$/.test(entryPrice)
  ) {
    return null;
  }

  return {
    replayed: value.replayed === true,
    balance,
    prediction: {
      id,
      market: prediction.market,
      direction: prediction.direction,
      points: String(prediction.points ?? ""),
      durationSeconds: prediction.durationSeconds,
      acceptedAt,
      closesAt,
      entryPrice,
      confidence: prediction.confidence,
    },
  };
}

export async function POST(request: NextRequest) {
  if (!localAuthConfigured()) {
    return authReply({ error: "Agent automation is not configured." }, 503);
  }

  const token = readAgentBearerToken(request);
  if (!token) {
    return authReply({ error: "Agent authorization required." }, 401);
  }

  try {
    const input = normalizeAgentPredictionInput(await request.json());
    if (!input) {
      return authReply({ error: "Invalid automated prediction." }, 400);
    }

    const tokenHash = hashAgentApiToken(token);
    const db = getSupabaseAdmin();
    const { data: connection, error: connectionError } = await db
      .from("predarc_agent_connections")
      .select("status,expires_at")
      .eq("token_hash", tokenHash)
      .maybeSingle();

    if (connectionError) throw new Error("Agent authorization lookup failed.");

    if (
      !connection ||
      connection.status !== "active" ||
      Date.parse(connection.expires_at) <= Date.now()
    ) {
      return authReply({ error: "Agent authorization is not active." }, 401);
    }

    const quote = await fetchCommunitySpotPrice(input.market);
    const { data, error } = await db.rpc(
      "predarc_agent_submit_prediction_v1",
      {
        p_token_hash: tokenHash,
        p_request_id: input.requestId,
        p_market: input.market,
        p_direction: input.direction,
        p_points: input.points,
        p_duration_seconds: input.durationSeconds,
        p_confidence: input.confidence,
        p_rationale: input.rationale,
        p_entry_price: quote.price,
        p_price_source: quote.source,
        p_entry_observed_at: quote.observedAt,
      }
    );

    if (error) {
      if (
        databaseErrorIncludes(error, "AGENT_AUTH_REQUIRED") ||
        databaseErrorIncludes(error, "AGENT_NOT_ACTIVE")
      ) {
        return authReply({ error: "Agent authorization is not active." }, 401);
      }

      if (
        databaseErrorIncludes(error, "AGENT_MARKET_NOT_ALLOWED") ||
        databaseErrorIncludes(error, "AGENT_DURATION_NOT_ALLOWED") ||
        databaseErrorIncludes(error, "AGENT_POINTS_LIMIT") ||
        databaseErrorIncludes(error, "AGENT_CONFIDENCE_TOO_LOW")
      ) {
        return authReply(
          { error: "This prediction is outside the authorized policy." },
          403
        );
      }

      if (databaseErrorIncludes(error, "AGENT_DAILY_LIMIT")) {
        return authReply({ error: "The agent reached its daily limit." }, 429);
      }

      if (
        databaseErrorIncludes(error, "INSUFFICIENT_POINTS") ||
        databaseErrorIncludes(error, "PREDICTION_SLOT_ACTIVE") ||
        databaseErrorIncludes(error, "REQUEST_ID_CONFLICT")
      ) {
        return authReply(
          {
            error: databaseErrorIncludes(error, "INSUFFICIENT_POINTS")
              ? "Not enough server points."
              : databaseErrorIncludes(error, "PREDICTION_SLOT_ACTIVE")
                ? "A prediction is already active for this market and duration."
                : "This request ID was already used with different details.",
          },
          409
        );
      }

      throw new Error("Automated prediction recording failed.");
    }

    const result = whitelistedPredictionResult(data);
    if (!result) throw new Error("Unexpected automated prediction response.");

    return authReply(result);
  } catch (error) {
    console.error("Automated prediction failed", error);
    return authReply(
      { error: "Automated prediction is temporarily unavailable." },
      503
    );
  }
}
