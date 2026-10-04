import { NextRequest } from "next/server";

import {
  isAgentAutomationSignature,
  isAgentAutomationUuid,
  normalizeAgentAutomationPolicy,
  type AgentConnectionStatus,
} from "@/lib/agent-automation-core";
import {
  agentPolicyHash,
  createAgentApiToken,
  hashAgentApiToken,
  verifyAgentPolicyAuthorization,
} from "@/lib/agent-automation-server";
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

type AgentConnectionRow = {
  id: unknown;
  name: unknown;
  allowed_markets: unknown;
  allowed_durations: unknown;
  max_points_per_prediction: unknown;
  max_daily_points: unknown;
  max_daily_predictions: unknown;
  minimum_confidence: unknown;
  status: unknown;
  expires_at: unknown;
  daily_usage_date: unknown;
  daily_points_used: unknown;
  daily_predictions_used: unknown;
  total_predictions: unknown;
  last_used_at: unknown;
  created_at: unknown;
};

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

function utcDate(value = new Date()): string {
  return value.toISOString().slice(0, 10);
}

function serializeConnection(row: AgentConnectionRow) {
  const expiresAt = String(row.expires_at ?? "");
  const storedStatus = String(row.status ?? "");
  const status: AgentConnectionStatus =
    storedStatus === "revoked"
      ? "revoked"
      : Date.parse(expiresAt) <= Date.now()
        ? "expired"
        : storedStatus === "paused"
          ? "paused"
          : "active";
  const usageIsToday = String(row.daily_usage_date ?? "") === utcDate();

  return {
    id: String(row.id ?? ""),
    name: String(row.name ?? ""),
    allowedMarkets: Array.isArray(row.allowed_markets)
      ? row.allowed_markets.map(String)
      : [],
    allowedDurations: Array.isArray(row.allowed_durations)
      ? row.allowed_durations.map(Number)
      : [],
    maxPointsPerPrediction: Number(row.max_points_per_prediction),
    maxDailyPoints: Number(row.max_daily_points),
    maxDailyPredictions: Number(row.max_daily_predictions),
    minimumConfidence: Number(row.minimum_confidence),
    expiresAt,
    status,
    dailyPointsUsed: usageIsToday
      ? String(row.daily_points_used ?? "0")
      : "0",
    dailyPredictionsUsed: usageIsToday
      ? Number(row.daily_predictions_used)
      : 0,
    totalPredictions: String(row.total_predictions ?? "0"),
    lastUsedAt:
      row.last_used_at === null ? null : String(row.last_used_at ?? ""),
    createdAt: String(row.created_at ?? ""),
  };
}

async function authenticatedRequest(request: NextRequest) {
  const tokenHash = sessionHash(request);
  const session = tokenHash ? await readAuthSession(request) : null;

  return tokenHash && session ? { tokenHash, session } : null;
}

function configurationGuard(request: NextRequest) {
  if (!localAuthConfigured()) {
    return authReply({ error: "Agent automation is not configured." }, 503);
  }

  if (!requestOriginAllowed(request)) {
    return authReply({ error: "Request origin is not allowed." }, 403);
  }

  return null;
}

export async function GET(request: NextRequest) {
  const guard = configurationGuard(request);
  if (guard) return guard;

  try {
    const auth = await authenticatedRequest(request);
    if (!auth) {
      return authReply({ error: "Sign in with your wallet first." }, 401);
    }

    const { data, error } = await getSupabaseAdmin()
      .from("predarc_agent_connections")
      .select(
        "id,name,allowed_markets,allowed_durations,max_points_per_prediction,max_daily_points,max_daily_predictions,minimum_confidence,status,expires_at,daily_usage_date,daily_points_used,daily_predictions_used,total_predictions,last_used_at,created_at"
      )
      .eq("chain_id", auth.session.chainId)
      .eq("wallet", auth.session.wallet.toLowerCase())
      .order("created_at", { ascending: false })
      .limit(20);

    if (error) throw new Error("Agent connection lookup failed.");

    return authReply({
      connections: ((data ?? []) as AgentConnectionRow[]).map(
        serializeConnection
      ),
    });
  } catch (error) {
    console.error("Agent connection list failed", error);
    return authReply({ error: "Unable to load agent connections." }, 503);
  }
}

export async function POST(request: NextRequest) {
  const guard = configurationGuard(request);
  if (guard) return guard;

  try {
    const auth = await authenticatedRequest(request);
    if (!auth) {
      return authReply({ error: "Sign in with your wallet first." }, 401);
    }

    const body = (await request.json()) as {
      challengeId?: unknown;
      policy?: unknown;
      signature?: unknown;
    };
    const policy = normalizeAgentAutomationPolicy(body.policy);

    if (
      !policy ||
      !isAgentAutomationUuid(body.challengeId) ||
      !isAgentAutomationSignature(body.signature)
    ) {
      return authReply({ error: "Invalid agent authorization." }, 400);
    }

    const db = getSupabaseAdmin();
    const { data: challenge, error: challengeError } = await db
      .from("predarc_agent_challenges")
      .select("nonce,policy_hash,expires_at,consumed_at")
      .eq("id", body.challengeId)
      .eq("session_hash", auth.tokenHash)
      .eq("chain_id", auth.session.chainId)
      .eq("wallet", auth.session.wallet.toLowerCase())
      .maybeSingle();

    if (challengeError) throw new Error("Agent challenge lookup failed.");

    const policyHash = agentPolicyHash(policy);
    if (
      !challenge ||
      challenge.consumed_at !== null ||
      challenge.policy_hash !== policyHash ||
      Date.parse(challenge.expires_at) <= Date.now()
    ) {
      return authReply(
        { error: "Agent authorization expired. Start again." },
        409
      );
    }

    const signatureValid = await verifyAgentPolicyAuthorization({
      wallet: auth.session.wallet,
      chainId: auth.session.chainId,
      challengeId: body.challengeId,
      nonce: challenge.nonce,
      policy,
      signature: body.signature,
    });

    if (!signatureValid) {
      return authReply({ error: "Wallet signature is not valid." }, 401);
    }

    const apiToken = createAgentApiToken();
    const connectionId = crypto.randomUUID();
    const { data, error } = await db.rpc("predarc_create_agent_connection_v1", {
      p_session_hash: auth.tokenHash,
      p_challenge_id: body.challengeId,
      p_connection_id: connectionId,
      p_name: policy.name,
      p_token_hash: hashAgentApiToken(apiToken),
      p_allowed_markets: policy.allowedMarkets,
      p_allowed_durations: policy.allowedDurations,
      p_max_points_per_prediction: policy.maxPointsPerPrediction,
      p_max_daily_points: policy.maxDailyPoints,
      p_max_daily_predictions: policy.maxDailyPredictions,
      p_minimum_confidence: policy.minimumConfidence,
      p_expires_at: policy.expiresAt,
      p_authorization_signature: body.signature,
      p_policy_hash: policyHash,
    });

    if (error) {
      if (databaseErrorIncludes(error, "AGENT_CONNECTION_LIMIT")) {
        return authReply(
          { error: "Pause or revoke an existing agent before adding another." },
          409
        );
      }

      if (databaseErrorIncludes(error, "AGENT_CHALLENGE_INVALID")) {
        return authReply(
          { error: "Agent authorization expired. Start again." },
          409
        );
      }

      throw new Error("Agent connection creation failed.");
    }

    const createdAt =
      isRecord(data) && typeof data.createdAt === "string"
        ? data.createdAt
        : new Date().toISOString();

    return authReply(
      {
        token: apiToken,
        connection: {
          id: connectionId,
          ...policy,
          status: "active",
          dailyPointsUsed: "0",
          dailyPredictionsUsed: 0,
          totalPredictions: "0",
          lastUsedAt: null,
          createdAt,
        },
      },
      201
    );
  } catch (error) {
    console.error("Agent connection creation failed", error);
    return authReply({ error: "Unable to connect this agent." }, 503);
  }
}

export async function PATCH(request: NextRequest) {
  const guard = configurationGuard(request);
  if (guard) return guard;

  try {
    const auth = await authenticatedRequest(request);
    if (!auth) {
      return authReply({ error: "Sign in with your wallet first." }, 401);
    }

    const body = (await request.json()) as {
      connectionId?: unknown;
      action?: unknown;
    };

    if (
      !isAgentAutomationUuid(body.connectionId) ||
      !["pause", "resume", "revoke"].includes(String(body.action))
    ) {
      return authReply({ error: "Invalid agent action." }, 400);
    }

    const { data, error } = await getSupabaseAdmin().rpc(
      "predarc_set_agent_state_v1",
      {
        p_session_hash: auth.tokenHash,
        p_connection_id: body.connectionId,
        p_action: body.action,
      }
    );

    if (error) {
      if (
        databaseErrorIncludes(error, "AGENT_CONNECTION_NOT_FOUND") ||
        databaseErrorIncludes(error, "AGENT_CONNECTION_REVOKED") ||
        databaseErrorIncludes(error, "AGENT_CONNECTION_EXPIRED")
      ) {
        return authReply({ error: "This agent cannot be updated." }, 409);
      }

      throw new Error("Agent state update failed.");
    }

    return authReply({
      connection: isRecord(data)
        ? { id: data.id, status: data.status }
        : null,
    });
  } catch (error) {
    console.error("Agent state update failed", error);
    return authReply({ error: "Unable to update this agent." }, 503);
  }
}
