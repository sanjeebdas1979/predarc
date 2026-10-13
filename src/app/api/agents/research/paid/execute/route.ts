import { NextRequest } from "next/server";

import {
  PAID_RESEARCH_CHAIN_ID,
  normalizePaidResearchExecution,
} from "@/lib/agent-research-paid-core";
import {
  PAID_RESEARCH_QUOTE_COLUMNS,
  PAID_RESEARCH_RECEIPT_COLUMNS,
  PaidResearchAmbiguousError,
  PaidResearchPaymentRejectedError,
  executePaidResearch,
  serializePaidResearchQuote,
  serializePaidResearchReceipt,
  sha256Hex,
  type PaidResearchQuoteRow,
  type PaidResearchReceiptRow,
  verifyPaidResearchReceipt,
  verifyPaidResearchSignature,
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

async function markQuote(
  tokenHash: string,
  quoteId: string,
  status: "failed" | "unknown",
  errorCode: string
) {
  const { error } = await getSupabaseAdmin().rpc(
    "predarc_finish_agent_research_paid_quote_v1",
    {
      p_session_hash: tokenHash,
      p_quote_id: quoteId,
      p_status: status,
      p_error_code: errorCode,
    }
  );
  if (error) console.error("Paid research quote status update failed", error);
}

async function existingReceipt(quoteId: string) {
  const { data, error } = await getSupabaseAdmin()
    .from("predarc_agent_research_paid_receipts")
    .select(PAID_RESEARCH_RECEIPT_COLUMNS)
    .eq("quote_id", quoteId)
    .maybeSingle();
  if (error) throw new Error("Paid receipt replay lookup failed.");
  const receipt = data
    ? serializePaidResearchReceipt(data as unknown as PaidResearchReceiptRow)
    : null;
  if (receipt && !verifyPaidResearchReceipt(receipt)) {
    throw new Error("Stored paid receipt verification failed.");
  }
  return receipt;
}

export async function POST(request: NextRequest) {
  if (!localAuthConfigured()) {
    return authReply({ error: "Paid Agent Research is not configured." }, 503);
  }
  if (!requestOriginAllowed(request)) {
    return authReply({ error: "Request origin is not allowed." }, 403);
  }

  let tokenHash = "";
  let quoteId = "";
  try {
    tokenHash = sessionHash(request) ?? "";
    const session = tokenHash ? await readAuthSession(request) : null;
    if (!tokenHash || !session) {
      return authReply({ error: "Sign in with your wallet first." }, 401);
    }
    if (session.chainId !== PAID_RESEARCH_CHAIN_ID) {
      return authReply(
        { error: "Paid Agent Research requires an Arc Mainnet session." },
        409
      );
    }

    const execution = normalizePaidResearchExecution(await request.json());
    if (!execution) {
      return authReply({ error: "Invalid paid research execution." }, 400);
    }
    quoteId = execution.quoteId;
    const db = getSupabaseAdmin();
    const { data, error } = await db
      .from("predarc_agent_research_paid_quotes")
      .select(PAID_RESEARCH_QUOTE_COLUMNS)
      .eq("id", quoteId)
      .eq("chain_id", PAID_RESEARCH_CHAIN_ID)
      .eq("wallet", session.wallet.toLowerCase())
      .maybeSingle();
    if (error) throw new Error("Paid quote lookup failed.");
    if (!data) return authReply({ error: "Paid quote was not found." }, 404);

    const row = data as unknown as PaidResearchQuoteRow;
    if (row.status === "completed") {
      const receipt = await existingReceipt(quoteId);
      if (!receipt) throw new Error("Completed paid receipt was not found.");
      return authReply({ receipt, replayed: true, verification: "verified" });
    }
    if (row.status !== "quoted") {
      return authReply(
        {
          error:
            row.status === "unknown"
              ? "This payment outcome is under review and will not be retried automatically."
              : "This paid quote can no longer be executed.",
        },
        409
      );
    }

    const quote = serializePaidResearchQuote(row);
    if (!quote || Date.parse(quote.expiresAt) <= Date.now()) {
      return authReply({ error: "This paid quote has expired." }, 409);
    }
    if (!(await verifyPaidResearchSignature({ quote, signature: execution.signature }))) {
      return authReply({ error: "Wallet payment signature is invalid." }, 401);
    }

    const signatureHash = sha256Hex(execution.signature.toLowerCase());
    const { error: claimError } = await db.rpc(
      "predarc_claim_agent_research_paid_quote_v1",
      {
        p_session_hash: tokenHash,
        p_quote_id: quoteId,
        p_signature_hash: signatureHash,
      }
    );
    if (claimError) {
      if (databaseErrorIncludes(claimError, "PAID_RESEARCH_QUOTE_EXPIRED")) {
        return authReply({ error: "This paid quote has expired." }, 409);
      }
      if (databaseErrorIncludes(claimError, "PAID_RESEARCH_QUOTE_BUSY")) {
        return authReply(
          { error: "This quote is already executing and was not retried." },
          409
        );
      }
      throw new Error("Paid quote claim failed.");
    }

    let receipt;
    try {
      receipt = await executePaidResearch({
        row,
        quote,
        signature: execution.signature,
      });
    } catch (error) {
      if (error instanceof PaidResearchPaymentRejectedError) {
        await markQuote(tokenHash, quoteId, "failed", "PAYMENT_REJECTED");
        return authReply({ error: error.message }, 402);
      }
      await markQuote(
        tokenHash,
        quoteId,
        "unknown",
        error instanceof PaidResearchAmbiguousError
          ? "PROVIDER_OUTCOME_UNKNOWN"
          : "INTERNAL_OUTCOME_UNKNOWN"
      );
      throw error;
    }

    const { error: completeError } = await db.rpc(
      "predarc_complete_agent_research_paid_quote_v1",
      {
        p_session_hash: tokenHash,
        p_quote_id: quoteId,
        p_receipt_id: receipt.id,
        p_signal: receipt.signal,
        p_confidence: receipt.confidence,
        p_rationale: receipt.rationale,
        p_response_hash: receipt.verification.responseHash,
        p_authorization_hash: receipt.verification.authorizationHash,
        p_actual_cost_atomic: receipt.spending.actualCostAtomic,
        p_payment_status: receipt.spending.status,
        p_payment_reference: receipt.spending.paymentReference,
        p_settlement_transaction: receipt.spending.settlementTransaction,
        p_provider_response_id: receipt.providerResponseId,
        p_created_at: receipt.createdAt,
        p_receipt_hash: receipt.receiptHash,
      }
    );
    if (completeError) {
      await markQuote(tokenHash, quoteId, "unknown", "RECEIPT_COMMIT_UNKNOWN");
      throw new PaidResearchAmbiguousError(
        "The provider responded, but receipt storage is under review. No retry was made."
      );
    }

    const stored = await existingReceipt(quoteId);
    if (!stored) throw new Error("Created paid receipt could not be verified.");
    return authReply(
      { receipt: stored, replayed: false, verification: "verified" },
      201
    );
  } catch (error) {
    console.error("Paid Agent Research execution failed", error);
    const ambiguous = error instanceof PaidResearchAmbiguousError;
    return authReply(
      {
        error: ambiguous
          ? error.message
          : "Unable to complete paid research. No automatic retry was made.",
      },
      ambiguous ? 502 : 503
    );
  }
}
