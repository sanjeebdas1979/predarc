import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  AGENT_RESEARCH_ENGINE_ID,
  AGENT_RESEARCH_ENGINE_VERSION,
  buildAgentResearchAnalysis,
  canonicalAgentResearchReceipt,
  canonicalAgentResearchRequest,
  normalizeAgentResearchRequest,
  parseAgentResearchResponse,
} from "../src/lib/agent-research-core.ts";

const requestId = "123e4567-e89b-42d3-a456-426614174000";
const receiptId = "223e4567-e89b-42d3-a456-426614174000";
const wallet = "0x" + "a".repeat(40);
const createdAt = "2026-10-13T10:00:00.000Z";

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function risingCandles() {
  return Array.from({ length: 60 }, (_, index) => {
    const close = 100 + index * 0.1;
    return {
      openTime: Date.parse("2026-10-13T08:00:00.000Z") + index * 60_000,
      closeTime:
        Date.parse("2026-10-13T08:00:00.000Z") + (index + 1) * 60_000 - 1,
      open: close - 0.05,
      high: close + 0.1,
      low: close - 0.15,
      close,
    };
  });
}

function sampleReceipt() {
  const payload = {
    id: receiptId,
    requestId,
    chainId: 5042,
    wallet,
    market: "BTC",
    durationSeconds: 300,
    signal: "higher",
    confidence: 78,
    rationale:
      "Horizon momentum is +10 bps, the fast trend is +8 bps, and recent one-minute volatility is 3 bps.",
    engine: {
      id: AGENT_RESEARCH_ENGINE_ID,
      version: AGENT_RESEARCH_ENGINE_VERSION,
      mode: "deterministic-preview",
    },
    evidence: {
      source: "Binance public market data",
      pair: "BTC/USDT",
      interval: "1m",
      sampleCount: 60,
      windowStart: "2026-10-13T08:00:00.000Z",
      windowEnd: "2026-10-13T09:00:00.000Z",
      observedAt: "2026-10-13T09:00:00.000Z",
      entryPrice: "105.9",
      evidenceHash: "b".repeat(64),
    },
    metrics: {
      horizonReturnBps: 10,
      fastTrendBps: 8,
      volatilityBps: 3,
      rangePositionBps: 2200,
      evidenceScoreBps: 30,
    },
    spending: {
      currency: "USDC",
      decimals: 6,
      maxCostAtomic: "10000",
      actualCostAtomic: "0",
      status: "not-charged",
      paymentReference: null,
    },
    createdAt,
  };

  return {
    ...payload,
    receiptHash: sha256(canonicalAgentResearchReceipt(payload)),
  };
}

test("research request binds wallet, network, horizon and budget cap", () => {
  const request = normalizeAgentResearchRequest({
    requestId,
    market: "BTC",
    durationSeconds: 300,
    maxCostAtomic: "10000",
  });

  assert.ok(request);
  assert.match(
    canonicalAgentResearchRequest({ request, chainId: 5042, wallet }),
    /"maxCostAtomic":"10000"/
  );
  assert.equal(
    normalizeAgentResearchRequest({ ...request, market: "DOGE" }),
    null
  );
  assert.equal(
    normalizeAgentResearchRequest({ ...request, maxCostAtomic: "250001" }),
    null
  );
});

test("preview analysis is deterministic and reports its evidence metrics", () => {
  const first = buildAgentResearchAnalysis(risingCandles(), 300);
  const second = buildAgentResearchAnalysis(risingCandles(), 300);

  assert.deepEqual(first, second);
  assert.equal(first?.signal, "higher");
  assert.ok((first?.confidence ?? 0) >= 50);
  assert.ok((first?.metrics.horizonReturnBps ?? 0) > 0);
  assert.match(first?.rationale ?? "", /Horizon momentum/);
  assert.equal(buildAgentResearchAnalysis(risingCandles().slice(0, 20), 300), null);
});

test("receipt fingerprint binds evidence, result and zero-cost boundary", () => {
  const receipt = sampleReceipt();

  assert.equal(
    sha256(canonicalAgentResearchReceipt(receipt)),
    receipt.receiptHash
  );
  assert.notEqual(
    sha256(
      canonicalAgentResearchReceipt({
        ...receipt,
        confidence: 79,
      })
    ),
    receipt.receiptHash
  );
  assert.equal(receipt.spending.actualCostAtomic, "0");
  assert.equal(receipt.spending.status, "not-charged");
});

test("research response parser rejects untrusted receipt fields", () => {
  const receipt = sampleReceipt();
  const parsed = parseAgentResearchResponse({
    receipt,
    replayed: false,
    verification: "verified",
  });

  assert.equal(parsed?.receipt.id, receiptId);
  assert.equal(
    parseAgentResearchResponse({
      receipt: {
        ...receipt,
        spending: { ...receipt.spending, actualCostAtomic: "1" },
      },
      replayed: false,
      verification: "verified",
    }),
    null
  );
});

test("research writes authenticate before database RPC and stay idempotent", () => {
  const route = readFileSync(
    new URL("../src/app/api/agents/research/route.ts", import.meta.url),
    "utf8"
  );
  const migration = readFileSync(
    new URL(
      "../supabase/migrations/202610130001_agent_research_preview.sql",
      import.meta.url
    ),
    "utf8"
  );

  assert.ok(
    route.indexOf("requestOriginAllowed(request)") <
      route.indexOf(".rpc(")
  );
  assert.ok(route.indexOf("readAuthSession(request)") < route.indexOf(".rpc("));
  assert.match(route, /canonicalAgentResearchRequest/);
  assert.match(migration, /unique \(chain_id, wallet, request_id\)/);
  assert.match(migration, /for update/);
  assert.match(migration, /RESEARCH_REQUEST_CONFLICT/);
  assert.match(migration, /created_at >= v_now - interval '24 hours'/);
  assert.match(migration, /RESEARCH_DAILY_LIMIT/);
});

test("Phase 1 receipts are immutable and cannot charge USDC", () => {
  const migration = readFileSync(
    new URL(
      "../supabase/migrations/202610130001_agent_research_preview.sql",
      import.meta.url
    ),
    "utf8"
  );
  const client = readFileSync(
    new URL(
      "../src/app/components/agents/AgentResearchClient.tsx",
      import.meta.url
    ),
    "utf8"
  );

  assert.match(migration, /actual_cost_atomic = 0/);
  assert.match(migration, /payment_status = 'not-charged'/);
  assert.match(
    migration,
    /revoke update, delete on public\.predarc_agent_research_receipts/
  );
  assert.match(client, /Preview currently charges/);
  assert.match(client, /Research\s+and execution remain separate/);
  assert.match(client, /pendingRequestId\.current \|\| crypto\.randomUUID\(\)/);
});

test("public research receipt renders its UTC timestamp once", () => {
  const receiptPage = readFileSync(
    new URL(
      "../src/app/research/receipts/[id]/page.tsx",
      import.meta.url
    ),
    "utf8"
  );

  assert.match(receiptPage, /timeZone: "UTC"/);
  assert.doesNotMatch(
    receiptPage,
    /shortDate\(receipt\.createdAt\)\}\s*UTC/
  );
});
