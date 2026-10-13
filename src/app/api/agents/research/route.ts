import { NextRequest } from "next/server";

import {
  AGENT_RESEARCH_DAILY_LIMIT,
  canonicalAgentResearchRequest,
  normalizeAgentResearchRequest,
} from "@/lib/agent-research-core";
import {
  AGENT_RESEARCH_RECEIPT_COLUMNS,
  createAgentResearchReceipt,
  getAgentResearchReceiptById,
  serializeAgentResearchRow,
  sha256Hex,
  type AgentResearchReceiptRow,
  verifyAgentResearchReceipt,
} from "@/lib/agent-research-server";
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

async function authenticatedRequest(request: NextRequest) {
  const tokenHash = sessionHash(request);
  const session = tokenHash ? await readAuthSession(request) : null;
  return tokenHash && session ? { tokenHash, session } : null;
}

function configurationGuard(request: NextRequest) {
  if (!localAuthConfigured()) {
    return authReply({ error: "Agent Research is not configured." }, 503);
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

    const since = new Date(Date.now() - 24 * 60 * 60_000).toISOString();
    const db = getSupabaseAdmin();
    const [{ data, error }, { count, error: countError }] = await Promise.all([
      db
        .from("predarc_agent_research_receipts")
        .select(AGENT_RESEARCH_RECEIPT_COLUMNS)
        .eq("chain_id", auth.session.chainId)
        .eq("wallet", auth.session.wallet.toLowerCase())
        .order("created_at", { ascending: false })
        .limit(20),
      db
        .from("predarc_agent_research_receipts")
        .select("id", { count: "exact", head: true })
        .eq("chain_id", auth.session.chainId)
        .eq("wallet", auth.session.wallet.toLowerCase())
        .gte("created_at", since),
    ]);

    if (error || countError) throw new Error("Research history lookup failed.");

    const receipts = ((data ?? []) as unknown as AgentResearchReceiptRow[]).map(
      serializeAgentResearchRow
    );

    if (receipts.some((receipt) => !receipt || !verifyAgentResearchReceipt(receipt))) {
      throw new Error("Stored research receipt verification failed.");
    }

    return authReply({
      receipts,
      usage: {
        runsLast24Hours: count ?? 0,
        dailyLimit: AGENT_RESEARCH_DAILY_LIMIT,
      },
    });
  } catch (error) {
    console.error("Agent Research history failed", error);
    return authReply({ error: "Unable to load research history." }, 503);
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

    const body = await request.json();
    const researchRequest = normalizeAgentResearchRequest(body);

    if (!researchRequest) {
      return authReply({ error: "Invalid research request." }, 400);
    }

    const inputHash = sha256Hex(
      canonicalAgentResearchRequest({
        request: researchRequest,
        chainId: auth.session.chainId,
        wallet: auth.session.wallet,
      })
    );
    const db = getSupabaseAdmin();
    const { data: existing, error: existingError } = await db
      .from("predarc_agent_research_receipts")
      .select(`${AGENT_RESEARCH_RECEIPT_COLUMNS},input_hash`)
      .eq("chain_id", auth.session.chainId)
      .eq("wallet", auth.session.wallet.toLowerCase())
      .eq("request_id", researchRequest.requestId)
      .maybeSingle();

    if (existingError) throw new Error("Research request lookup failed.");

    const existingRow = existing
      ? (existing as unknown as AgentResearchReceiptRow)
      : null;

    if (existingRow) {
      if (String(existingRow.input_hash ?? "") !== inputHash) {
        return authReply(
          { error: "This request ID was already used with different inputs." },
          409
        );
      }

      const receipt = serializeAgentResearchRow(
        existingRow
      );
      if (!receipt || !verifyAgentResearchReceipt(receipt)) {
        throw new Error("Stored research receipt verification failed.");
      }

      return authReply({
        receipt,
        replayed: true,
        verification: "verified",
      });
    }

    const since = new Date(Date.now() - 24 * 60 * 60_000).toISOString();
    const { count, error: countError } = await db
      .from("predarc_agent_research_receipts")
      .select("id", { count: "exact", head: true })
      .eq("chain_id", auth.session.chainId)
      .eq("wallet", auth.session.wallet.toLowerCase())
      .gte("created_at", since);

    if (countError) throw new Error("Research usage lookup failed.");
    if ((count ?? 0) >= AGENT_RESEARCH_DAILY_LIMIT) {
      return authReply(
        { error: "The 10-run rolling 24-hour research limit is reached." },
        429
      );
    }

    const receipt = await createAgentResearchReceipt({
      id: crypto.randomUUID(),
      requestId: researchRequest.requestId,
      chainId: auth.session.chainId,
      wallet: auth.session.wallet,
      market: researchRequest.market,
      durationSeconds: researchRequest.durationSeconds,
      maxCostAtomic: researchRequest.maxCostAtomic,
      createdAt: new Date().toISOString(),
    });
    const { data: result, error } = await db.rpc(
      "predarc_create_agent_research_receipt_v1",
      {
        p_session_hash: auth.tokenHash,
        p_id: receipt.id,
        p_request_id: receipt.requestId,
        p_input_hash: inputHash,
        p_market: receipt.market,
        p_duration_seconds: receipt.durationSeconds,
        p_signal: receipt.signal,
        p_confidence: receipt.confidence,
        p_rationale: receipt.rationale,
        p_engine_id: receipt.engine.id,
        p_engine_version: receipt.engine.version,
        p_engine_mode: receipt.engine.mode,
        p_evidence_source: receipt.evidence.source,
        p_evidence_pair: receipt.evidence.pair,
        p_evidence_interval: receipt.evidence.interval,
        p_evidence_sample_count: receipt.evidence.sampleCount,
        p_evidence_window_start: receipt.evidence.windowStart,
        p_evidence_window_end: receipt.evidence.windowEnd,
        p_evidence_observed_at: receipt.evidence.observedAt,
        p_evidence_entry_price: receipt.evidence.entryPrice,
        p_evidence_hash: receipt.evidence.evidenceHash,
        p_metrics: receipt.metrics,
        p_spending_currency: receipt.spending.currency,
        p_spending_decimals: receipt.spending.decimals,
        p_max_cost_atomic: receipt.spending.maxCostAtomic,
        p_actual_cost_atomic: receipt.spending.actualCostAtomic,
        p_payment_status: receipt.spending.status,
        p_payment_reference: receipt.spending.paymentReference,
        p_created_at: receipt.createdAt,
        p_receipt_hash: receipt.receiptHash,
      }
    );

    if (error) {
      if (databaseErrorIncludes(error, "RESEARCH_DAILY_LIMIT")) {
        return authReply(
          { error: "The 10-run rolling 24-hour research limit is reached." },
          429
        );
      }
      if (databaseErrorIncludes(error, "RESEARCH_REQUEST_CONFLICT")) {
        return authReply(
          { error: "This request ID was already used with different inputs." },
          409
        );
      }
      throw new Error("Research receipt creation failed.");
    }

    const storedId =
      isRecord(result) && typeof result.id === "string"
        ? result.id
        : receipt.id;
    const stored = await getAgentResearchReceiptById(storedId);

    if (!stored || !verifyAgentResearchReceipt(stored)) {
      throw new Error("Created research receipt could not be verified.");
    }

    const replayed =
      isRecord(result) && typeof result.replayed === "boolean"
        ? result.replayed
        : false;

    return authReply(
      {
        receipt: stored,
        replayed,
        verification: "verified",
      },
      replayed ? 200 : 201
    );
  } catch (error) {
    console.error("Agent Research run failed", error);
    return authReply(
      { error: "Unable to complete market research right now." },
      503
    );
  }
}
