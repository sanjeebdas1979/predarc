import { NextRequest } from "next/server";
import {
  authReply,
  localAuthConfigured,
  readAuthSession,
  requestOriginAllowed,
  sessionHash,
} from "@/lib/auth-session";
import { getSupabaseAdmin } from "@/lib/supabase-admin";

type AccountRpcResult = {
  wallet?: string | null;
  balance?: number | string | null;
  sessionExpiresAt?: string | null;
};

export async function GET() {
  return authReply(
    { error: "Use POST with an authenticated Predarc session." },
    405
  );
}

export async function POST(request: NextRequest) {
  if (!localAuthConfigured()) {
    return authReply(
      { error: "Account API is not configured." },
      503
    );
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

    const { data: accountResult, error: accountError } =
      await getSupabaseAdmin().rpc("predarc_account_v1", {
        p_session_hash: tokenHash,
      });

    if (accountError || !accountResult) {
      throw new Error("Account lookup failed");
    }

    const account = accountResult as AccountRpcResult;

    return authReply({
      authenticated: true,
      wallet: account.wallet ?? null,
      chainId: session.chainId,
      balance: String(account.balance ?? 0),
      points: Number(account.balance ?? 0),
      totalPredictions: 0,
      wins: 0,
      losses: 0,
      rewardsClaimed: 0,
      updatedAt: account.sessionExpiresAt ?? null,
    });
  } catch (error) {
    console.error("Account API failed", error);
    return authReply({ error: "Unable to load account." }, 500);
  }
}
