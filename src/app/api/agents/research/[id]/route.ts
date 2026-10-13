import { NextResponse } from "next/server";

import {
  isAgentResearchUuid,
  type AgentResearchReceipt,
} from "@/lib/agent-research-core";
import {
  getPaidResearchReceiptById,
  verifyPaidResearchReceipt,
} from "@/lib/agent-research-paid-server";
import {
  getAgentResearchReceiptById,
  verifyAgentResearchReceipt,
} from "@/lib/agent-research-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  if (!isAgentResearchUuid(id)) {
    return NextResponse.json(
      { error: "Invalid research receipt ID." },
      { status: 400, headers: { "Cache-Control": "no-store" } }
    );
  }

  try {
    const paidReceipt = await getPaidResearchReceiptById(id);
    const receipt = paidReceipt ?? (await getAgentResearchReceiptById(id));
    if (!receipt) {
      return NextResponse.json(
        { error: "Research receipt not found." },
        { status: 404, headers: { "Cache-Control": "no-store" } }
      );
    }

    const verified = paidReceipt
      ? verifyPaidResearchReceipt(paidReceipt)
      : verifyAgentResearchReceipt(receipt as AgentResearchReceipt);
    if (!verified) {
      return NextResponse.json(
        { error: "Research receipt integrity check failed." },
        { status: 422, headers: { "Cache-Control": "no-store" } }
      );
    }

    return NextResponse.json(
      { receipt, verification: "verified" },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (error) {
    console.error("Public research receipt lookup failed", error);
    return NextResponse.json(
      { error: "Unable to verify this research receipt." },
      { status: 503, headers: { "Cache-Control": "no-store" } }
    );
  }
}
