import { NextRequest } from "next/server";
import {
  authReply,
  localAuthConfigured,
  readAuthSession,
  requestOriginAllowed,
} from "@/lib/auth-session";
import { getSupabaseAdmin } from "@/lib/supabase-admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type PredictionRow = {
  id: string;
  market: string;
  direction: string;
  points: number | string;
  duration_seconds: number | string;
  status: string;
  entry_price: number | string;
  accepted_at: string;
  closes_at: string;
  settled_at?: string | null;
  result?: string | null;
  exit_price?: number | string | null;
  reward_points?: number | string | null;
  claim_status?: string | null;
  claimed_at?: string | null;
};

type AccountRpcRow = {
  points?: number | string | null;
  total_predictions?: number | string | null;
  wins?: number | string | null;
  losses?: number | string | null;
  rewards_claimed?: number | string | null;
  updated_at?: string | null;
};

function normalizePrediction(row: PredictionRow) {
  const stakePoints = Number(row.points ?? 0);
  const rewardPoints = Number(row.reward_points ?? 0);
  const status = String(row.status ?? "accepted").toLowerCase();
  const result = row.result ? String(row.result).toLowerCase() : null;
  const claimStatus = row.claim_status
    ? String(row.claim_status).toLowerCase()
    : null;

  return {
    id: row.id,
    market: row.market,
    direction: row.direction,
    stakePoints,
    points: stakePoints,
    durationSeconds: Number(row.duration_seconds ?? 0),
    status,
    entryPrice: Number(row.entry_price ?? 0),
    exitPrice:
      row.exit_price === null || row.exit_price === undefined
        ? null
        : Number(row.exit_price),
    rewardPoints,
    claimStatus,
    claimedAt: row.claimed_at ?? null,
    acceptedAt: row.accepted_at,
    closesAt: row.closes_at,
    settledAt: row.settled_at ?? null,
    result,
    canSettle: status === "accepted" && Date.parse(row.closes_at) <= Date.now(),
    canClaim:
      status === "settled" &&
      result === "won" &&
      rewardPoints > 0 &&
      claimStatus !== "claimed",
  };
}

export async function GET(request: NextRequest) {
  if (!localAuthConfigured()) {
    return authReply(
      { error: "Prediction history is available only in the local testnet setup." },
      503
    );
  }

  if (!requestOriginAllowed(request)) {
    return authReply({ error: "Request origin is not allowed." }, 403);
  }

  try {
    const session = await readAuthSession(request);
    if (!session) {
      return authReply({ predictions: [], account: null }, 200);
    }

    const wallet = session.wallet.toLowerCase();

    const { data: accountResult } = await getSupabaseAdmin()
      .rpc("predarc_get_or_create_account", {
        p_wallet: wallet,
        p_starting_points: 1000,
      })
      .single();

    const account = accountResult as AccountRpcRow | null;

    const { data, error } = await getSupabaseAdmin()
      .from("predarc_predictions")
      .select(
        "id,market,direction,points,duration_seconds,status,entry_price,accepted_at,closes_at,settled_at,result,exit_price,reward_points,claim_status,claimed_at"
      )
      .eq("wallet", wallet)
      .order("accepted_at", { ascending: false })
      .limit(50);

    if (error) throw new Error("Prediction history lookup failed");

    const predictions = ((data ?? []) as unknown as PredictionRow[]).map(
      normalizePrediction
    );

    return authReply({
      account: account
        ? {
            wallet,
            points: Number(account.points ?? 0),
            totalPredictions: Number(account.total_predictions ?? 0),
            wins: Number(account.wins ?? 0),
            losses: Number(account.losses ?? 0),
            rewardsClaimed: Number(account.rewards_claimed ?? 0),
            updatedAt: account.updated_at ?? null,
          }
        : null,
      predictions,
    });
  } catch (error) {
    console.error("Prediction history API failed", error);
    return authReply({ error: "Unable to load prediction history." }, 500);
  }
}