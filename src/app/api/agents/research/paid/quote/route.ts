import { NextRequest } from "next/server";

import {
  canonicalPaidResearchRequest,
  normalizePaidResearchRequest,
} from "@/lib/agent-research-paid-core";
import {
  PAID_RESEARCH_QUOTE_COLUMNS,
  preparePaidResearchQuote,
  serializePaidResearchQuote,
  sha256Hex,
  type PaidResearchQuoteRow,
} from "@/lib/agent-research-paid-server";
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

export async function POST(request: NextRequest) {
  if (!localAuthConfigured()) {
    return authReply({ error: "Paid Agent Research is not configured." }, 503);
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
    const body = await request.json();
    const paidRequest = normalizePaidResearchRequest(body);
    if (!paidRequest) {
      return authReply({ error: "Invalid paid research request." }, 400);
    }
    const inputHash = sha256Hex(
      canonicalPaidResearchRequest({
        request: paidRequest,
        wallet: session.wallet,
        chainId: session.chainId,
      })
    );
    const db = getSupabaseAdmin();
    const { data: existing, error: existingError } = await db
      .from("predarc_agent_research_paid_quotes")
      .select(PAID_RESEARCH_QUOTE_COLUMNS)
      .eq("chain_id", session.chainId)
      .eq("wallet", session.wallet.toLowerCase())
      .eq("request_id", paidRequest.requestId)
      .maybeSingle();
    if (existingError) throw new Error("Paid quote lookup failed.");

    if (existing) {
      const row = existing as unknown as PaidResearchQuoteRow;
      if (String(row.input_hash ?? "") !== inputHash) {
        return authReply(
          { error: "This request ID was already used with different inputs." },
          409
        );
      }
      const quote = serializePaidResearchQuote(row);
      if (
        quote &&
        row.status === "quoted" &&
        Date.parse(quote.expiresAt) > Date.now()
      ) {
        return authReply({ quote, replayed: true });
      }
      return authReply(
        { error: "This paid request is no longer quotable. Start a new request." },
        409
      );
    }

    const prepared = await preparePaidResearchQuote({
      chainId: session.chainId,
      request: paidRequest,
      wallet: session.wallet,
      inputHash,
    });
    const { error } = await db.rpc("predarc_create_agent_research_paid_quote_v1", {
      p_session_hash: tokenHash,
      p_id: prepared.id,
      p_request_id: paidRequest.requestId,
      p_input_hash: inputHash,
      p_market: paidRequest.market,
      p_duration_seconds: paidRequest.durationSeconds,
      p_model: paidRequest.model,
      p_max_cost_atomic: paidRequest.maxCostAtomic,
      p_daily_cost_cap_atomic: paidRequest.dailyCostCapAtomic,
      p_quote_amount_atomic: prepared.quote.amountAtomic,
      p_scheme: prepared.quote.scheme,
      p_network: prepared.quote.network,
      p_asset: prepared.quote.typedData.domain.verifyingContract,
      p_pay_to: prepared.quote.typedData.message.to,
      p_max_timeout_seconds: prepared.maxTimeoutSeconds,
      p_resource: prepared.resource,
      p_extensions: prepared.extensions,
      p_payment_extra: prepared.paymentExtra,
      p_authorization_nonce: prepared.quote.typedData.message.nonce,
      p_valid_after: prepared.quote.typedData.message.validAfter,
      p_valid_before: prepared.quote.typedData.message.validBefore,
      p_request_body: prepared.requestBody,
      p_prompt_hash: prepared.promptHash,
      p_evidence_source: prepared.bundle.evidence.source,
      p_evidence_pair: prepared.bundle.evidence.pair,
      p_evidence_interval: prepared.bundle.evidence.interval,
      p_evidence_sample_count: prepared.bundle.evidence.sampleCount,
      p_evidence_window_start: prepared.bundle.evidence.windowStart,
      p_evidence_window_end: prepared.bundle.evidence.windowEnd,
      p_evidence_observed_at: prepared.bundle.evidence.observedAt,
      p_evidence_entry_price: prepared.bundle.evidence.entryPrice,
      p_evidence_hash: prepared.bundle.evidence.evidenceHash,
      p_metrics: prepared.bundle.metrics,
      p_expires_at: prepared.quote.expiresAt,
    });
    if (error) {
      if (databaseErrorIncludes(error, "PAID_RESEARCH_DAILY_SPEND_LIMIT")) {
        return authReply(
          { error: "This quote would exceed your rolling 24-hour USDC cap." },
          429
        );
      }
      if (databaseErrorIncludes(error, "PAID_RESEARCH_DAILY_RUN_LIMIT")) {
        return authReply(
          { error: "The 10-run rolling 24-hour paid research limit is reached." },
          429
        );
      }
      if (databaseErrorIncludes(error, "PAID_RESEARCH_REQUEST_CONFLICT")) {
        return authReply(
          { error: "This request ID was already used with different inputs." },
          409
        );
      }
      if (databaseErrorIncludes(error, "PAID_RESEARCH_REQUEST_EXISTS")) {
        return authReply(
          { error: "This paid request is already being prepared." },
          409
        );
      }
      throw new Error("Paid quote creation failed.");
    }

    const { data: stored, error: storedError } = await db
      .from("predarc_agent_research_paid_quotes")
      .select(PAID_RESEARCH_QUOTE_COLUMNS)
      .eq("id", prepared.id)
      .single();
    if (storedError) throw new Error("Stored paid quote lookup failed.");
    const quote = serializePaidResearchQuote(
      stored as unknown as PaidResearchQuoteRow
    );
    if (!quote) throw new Error("Stored paid quote verification failed.");
    return authReply({ quote, replayed: false }, 201);
  } catch (error) {
    console.error("Paid Agent Research quote failed", error);
    const message =
      error instanceof Error && error.message.length <= 180
        ? error.message
        : "Unable to prepare a paid research quote.";
    return authReply({ error: message }, 503);
  }
}
