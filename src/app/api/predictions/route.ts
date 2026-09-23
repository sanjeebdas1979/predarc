import { NextRequest } from "next/server";
import {
  authReply,
  localAuthConfigured,
  requestOriginAllowed,
  sessionHash,
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
};

type AccountResult = {
  wallet?: string | null;
  balance?: number | string | null;
  points?: number | string | null;
  total_predictions?: number | string | null;
  wins?: number | string | null;
  losses?: number | string | null;
  rewards_claimed?: number | string | null;
  updated_at?: string | null;
  sessionExpiresAt?: string | null;
};

type ClaimLedgerRow = {
  source_id?: string | null;
  delta?: number | string | null;
  created_at?: string | null;
};

function normalizeAccount(account: AccountResult | null, wallet: string) {
  if (!account) return null;
  const points = account.points ?? account.balance ?? 0;

  return {
    wallet,
    points: Number(points ?? 0),
    totalPredictions: Number(account.total_predictions ?? 0),
    wins: Number(account.wins ?? 0),
    losses: Number(account.losses ?? 0),
    rewardsClaimed: Number(account.rewards_claimed ?? 0),
    updatedAt: account.updated_at ?? account.sessionExpiresAt ?? null,
  };
}

function normalizePrediction(
  row: PredictionRow,
  claimByPredictionId: Map<string, ClaimLedgerRow>
) {
  const stakePoints = Number(row.points ?? 0);
  const status = String(row.status ?? "accepted").toLowerCase();
  const result = row.result ? String(row.result).toLowerCase() : null;
  const claim = claimByPredictionId.get(row.id);
  const rewardPoints = claim ? Number(claim.delta ?? 0) : 0;
  const claimStatus = claim ? "claimed" : null;

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
    claimedAt: claim?.created_at ?? null,
    acceptedAt: row.accepted_at,
    closesAt: row.closes_at,
    settledAt: row.settled_at ?? null,
    result,
    canSettle: status === "accepted" && Date.parse(row.closes_at) <= Date.now(),
    canClaim:
      status === "settled" &&
      result === "won" &&
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
    const tokenHash = sessionHash(request);
    if (!tokenHash) {
      return authReply({ predictions: [], account: null }, 200);
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
      return authReply({ predictions: [], account: null }, 200);
    }

    const wallet = String(session.wallet).toLowerCase();

    const { data: accountResult } = await getSupabaseAdmin()
      .rpc("predarc_account_v1", {
        p_session_hash: tokenHash,
      })
      .single();

    const { data, error } = await getSupabaseAdmin()
      .from("predarc_predictions")
      .select(
        "id,market,direction,points,duration_seconds,status,entry_price,accepted_at,closes_at,settled_at,result,exit_price"
      )
      .eq("wallet", wallet)
      .order("accepted_at", { ascending: false })
      .limit(50);

    if (error) throw new Error("Prediction history lookup failed");

    const predictionRows = (data ?? []) as PredictionRow[];
    const predictionIds = predictionRows.map((row) => row.id);
    const claimByPredictionId = new Map<string, ClaimLedgerRow>();

    if (predictionIds.length > 0) {
      const { data: claimRows } = await getSupabaseAdmin()
        .from("predarc_points_ledger")
        .select("source_id,delta,created_at")
        .eq("wallet", wallet)
        .eq("kind", "claim_credit")
        .in("source_id", predictionIds);

      for (const claim of (claimRows ?? []) as ClaimLedgerRow[]) {
        if (claim.source_id) claimByPredictionId.set(claim.source_id, claim);
      }
    }

    const predictions = predictionRows.map((row) =>
      normalizePrediction(row, claimByPredictionId)
    );

    return authReply({
      account: normalizeAccount(accountResult as AccountResult | null, wallet),
      predictions,
    });
  } catch (error) {
    console.error("Prediction history API failed", error);
    return authReply({ error: "Unable to load prediction history." }, 500);
  }
}
