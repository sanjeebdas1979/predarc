import { NextRequest } from "next/server";

import { PAID_RESEARCH_DAILY_LIMIT } from "@/lib/agent-research-paid-core";
import {
  PAID_RESEARCH_RECEIPT_COLUMNS,
  serializePaidResearchReceipt,
  type PaidResearchReceiptRow,
  verifyPaidResearchReceipt,
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

export async function GET(request: NextRequest) {
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
    const since = new Date(Date.now() - 24 * 60 * 60_000).toISOString();
    const db = getSupabaseAdmin();
    const [{ data, error }, { data: usageRows, error: usageError }] =
      await Promise.all([
        db
          .from("predarc_agent_research_paid_receipts")
          .select(PAID_RESEARCH_RECEIPT_COLUMNS)
          .eq("chain_id", session.chainId)
          .eq("wallet", session.wallet.toLowerCase())
          .order("created_at", { ascending: false })
          .limit(20),
        db
          .from("predarc_agent_research_paid_receipts")
          .select("actual_cost_atomic")
          .eq("chain_id", session.chainId)
          .eq("wallet", session.wallet.toLowerCase())
          .gte("created_at", since),
      ]);

    if (error || usageError) throw new Error("Paid research history lookup failed.");
    const receipts = ((data ?? []) as unknown as PaidResearchReceiptRow[]).map(
      serializePaidResearchReceipt
    );
    if (receipts.some((receipt) => !receipt || !verifyPaidResearchReceipt(receipt))) {
      throw new Error("Stored paid research receipt verification failed.");
    }
    const spentAtomic = (usageRows ?? []).reduce(
      (sum, row) => sum + BigInt(String(row.actual_cost_atomic ?? "0")),
      0n
    );

    return authReply({
      receipts,
      usage: {
        runsLast24Hours: usageRows?.length ?? 0,
        dailyLimit: PAID_RESEARCH_DAILY_LIMIT,
        spentAtomic: spentAtomic.toString(),
      },
    });
  } catch (error) {
    console.error("Paid Agent Research history failed", error);
    return authReply({ error: "Unable to load paid research history." }, 503);
  }
}
