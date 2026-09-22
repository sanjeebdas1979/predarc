import { NextRequest } from "next/server";
import {
  authReply,
  localAuthConfigured,
  requestOriginAllowed,
  sessionHash,
} from "@/lib/auth-session";
import { getSupabaseAdmin } from "@/lib/supabase-admin";

const startingPoints = 1000;

type AccountRpcRow = {
  points?: number | string | null;
  total_predictions?: number | string | null;
  wins?: number | string | null;
  losses?: number | string | null;
  rewards_claimed?: number | string | null;
  updated_at?: string | null;
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
      { error: "Account API is available only in the local testnet setup." },
      503
    );
  }

  if (!requestOriginAllowed(request)) {
    return authReply({ error: "Request origin is not allowed." }, 403);
  }

  try {
    const tokenHash = sessionHash(request);
    if (!tokenHash) {
      return authReply({ error: "Connect wallet first." }, 401);
    }

    const { data: session, error: sessionError } = await getSupabaseAdmin()
      .from("predarc_auth_sessions")
      .select("wallet,expires_at")
      .eq("token_hash", tokenHash)
      .maybeSingle();

    if (sessionError) throw new Error("Session lookup failed");
    if (
      !session ||
      !(Date.parse(String(session.expires_at)) > Date.now()) ||
      !String(session.wallet).startsWith("0x")
    ) {
      return authReply({ error: "Connect wallet first." }, 401);
    }

    const wallet = String(session.wallet).toLowerCase();

    const { data: accountResult, error: accountError } =
      await getSupabaseAdmin()
        .rpc("predarc_get_or_create_account", {
          p_wallet: wallet,
          p_starting_points: startingPoints,
        })
        .single();

    if (accountError) throw new Error("Account lookup failed");

    const account = accountResult as AccountRpcRow;

    return authReply({
      wallet,
      points: Number(account.points ?? 0),
      totalPredictions: Number(account.total_predictions ?? 0),
      wins: Number(account.wins ?? 0),
      losses: Number(account.losses ?? 0),
      rewardsClaimed: Number(account.rewards_claimed ?? 0),
      updatedAt: account.updated_at ?? null,
    });
  } catch (error) {
    console.error("Account API failed", error);
    return authReply({ error: "Unable to load account." }, 500);
  }
}