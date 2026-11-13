import { NextRequest } from "next/server";
import {
  authReply,
  localAuthConfigured,
  readAuthSession,
  requestOriginAllowed,
  sessionHash,
} from "@/lib/auth-session";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import {
  describeAccountRpcShape,
  normalizePredarcAccountRpc,
} from "@/lib/predarc-account-core";

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

    if (accountError) {
      // Keep the session hash and RPC arguments out of logs, but retain the
      // database error fields needed to diagnose production schema drift.
      console.error("Account RPC failed", {
        code: accountError.code,
        message: accountError.message,
        details: accountError.details,
        hint: accountError.hint,
      });
      throw new Error("Account lookup failed");
    }

    if (!accountResult) {
      console.error("Account RPC returned no account");
      throw new Error("Account lookup failed");
    }

    const account = normalizePredarcAccountRpc(
      accountResult,
      session.wallet,
      session.chainId
    );

    if (!account) {
      console.error(
        "Account RPC returned an unexpected shape",
        describeAccountRpcShape(accountResult)
      );
      throw new Error("Account response validation failed");
    }

    return authReply({
      authenticated: true,
      wallet: account.wallet,
      chainId: session.chainId,
      balance: account.balance,
      points: Number(account.balance),
      totalPredictions: 0,
      wins: 0,
      losses: 0,
      rewardsClaimed: 0,
      updatedAt: account.sessionExpiresAt,
    });
  } catch (error) {
    console.error("Account API failed", error);
    return authReply({ error: "Unable to load account." }, 500);
  }
}
