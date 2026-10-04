import { NextRequest } from "next/server";

import { normalizeAgentAutomationPolicy } from "@/lib/agent-automation-core";
import {
  agentPolicyHash,
  createAgentChallengeNonce,
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

export async function POST(request: NextRequest) {
  if (!localAuthConfigured()) {
    return authReply({ error: "Agent automation is not configured." }, 503);
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

    const body = (await request.json()) as { policy?: unknown };
    const policy = normalizeAgentAutomationPolicy(body.policy);

    if (!policy) {
      return authReply({ error: "Invalid agent automation policy." }, 400);
    }

    const challengeId = crypto.randomUUID();
    const nonce = createAgentChallengeNonce();
    const expiresAt = new Date(Date.now() + 10 * 60_000).toISOString();
    const { error } = await getSupabaseAdmin()
      .from("predarc_agent_challenges")
      .insert({
        id: challengeId,
        session_hash: tokenHash,
        chain_id: session.chainId,
        wallet: session.wallet.toLowerCase(),
        policy_hash: agentPolicyHash(policy),
        nonce,
        expires_at: expiresAt,
      });

    if (error) throw new Error("Agent challenge creation failed.");

    return authReply({ challengeId, nonce, expiresAt });
  } catch (error) {
    console.error("Agent challenge creation failed", error);
    return authReply(
      { error: "Unable to prepare agent authorization." },
      503
    );
  }
}
