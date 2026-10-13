import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { stripTypeScriptTypes } from "node:module";
import test from "node:test";

const paidCoreUrl = new URL(
  "../src/lib/agent-research-paid-core.ts",
  import.meta.url
);
const previewCoreUrl = new URL(
  "../src/lib/agent-research-core.ts",
  import.meta.url
).href;
const paidCoreSource = readFileSync(paidCoreUrl, "utf8").replace(
  'from "@/lib/agent-research-core";',
  `from "${previewCoreUrl}";`
);
const paidCore = await import(
  `data:text/javascript;base64,${Buffer.from(
    stripTypeScriptTypes(paidCoreSource)
  ).toString("base64")}`
);

const wallet = `0x${"a".repeat(40)}`;
const payTo = `0x${"b".repeat(40)}`;
const requestId = "123e4567-e89b-42d3-a456-426614174000";
const quoteId = "223e4567-e89b-42d3-a456-426614174000";
const receiptId = "323e4567-e89b-42d3-a456-426614174000";

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function sampleQuote() {
  return {
    quoteId,
    requestId,
    chainId: 5042,
    wallet,
    market: "BTC",
    durationSeconds: 300,
    model: paidCore.PAID_RESEARCH_MODEL,
    amountAtomic: "2000",
    maxCostAtomic: "5000",
    dailyCostCapAtomic: "25000",
    currency: "USDC",
    scheme: "exact",
    network: "eip155:5042",
    resourceUrl: paidCore.PAID_RESEARCH_ENDPOINT,
    expiresAt: "2026-10-14T10:05:00.000Z",
    typedData: paidCore.buildPaidResearchTypedData({
      wallet,
      payTo,
      amountAtomic: "2000",
      validAfter: "1791961800",
      validBefore: "1791962700",
      nonce: `0x${"c".repeat(64)}`,
    }),
  };
}

function sampleReceipt() {
  const payload = {
    id: receiptId,
    quoteId,
    requestId,
    chainId: 5042,
    wallet,
    market: "BTC",
    durationSeconds: 300,
    signal: "higher",
    confidence: 77,
    rationale:
      "Finalized momentum and trend are aligned, while recent volatility remains bounded for this horizon.",
    engine: {
      id: paidCore.PAID_RESEARCH_ENGINE_ID,
      version: paidCore.PAID_RESEARCH_ENGINE_VERSION,
      mode: "paid-ai",
      provider: paidCore.PAID_RESEARCH_PROVIDER,
      model: paidCore.PAID_RESEARCH_MODEL,
    },
    evidence: {
      source: "Binance public market data",
      pair: "BTC/USDT",
      interval: "1m",
      sampleCount: 120,
      windowStart: "2026-10-14T08:00:00.000Z",
      windowEnd: "2026-10-14T10:00:00.000Z",
      observedAt: "2026-10-14T10:00:00.000Z",
      entryPrice: "100000.25",
      evidenceHash: "d".repeat(64),
    },
    metrics: {
      horizonReturnBps: 10,
      fastTrendBps: 8,
      volatilityBps: 3,
      rangePositionBps: 1200,
      evidenceScoreBps: 20,
    },
    verification: {
      promptHash: "e".repeat(64),
      responseHash: "f".repeat(64),
      authorizationHash: "1".repeat(64),
    },
    spending: {
      currency: "USDC",
      decimals: 6,
      maxCostAtomic: "5000",
      dailyCostCapAtomic: "25000",
      actualCostAtomic: "2000",
      status: "settled",
      scheme: "exact",
      network: "eip155:5042",
      asset: paidCore.PAID_RESEARCH_USDC,
      payTo,
      paymentReference: `0x${"2".repeat(64)}`,
      settlementTransaction: `0x${"2".repeat(64)}`,
    },
    providerResponseId: "chatcmpl_predarc_test",
    createdAt: "2026-10-14T10:00:10.000Z",
  };
  return {
    ...payload,
    receiptHash: sha256(paidCore.canonicalPaidResearchReceipt(payload)),
  };
}

test("paid request enforces per-call and rolling Mainnet USDC caps", () => {
  const valid = paidCore.normalizePaidResearchRequest({
    requestId,
    market: "BTC",
    durationSeconds: 300,
    model: paidCore.PAID_RESEARCH_MODEL,
    maxCostAtomic: "5000",
    dailyCostCapAtomic: "25000",
  });
  assert.ok(valid);
  assert.equal(
    paidCore.normalizePaidResearchRequest({
      ...valid,
      maxCostAtomic: "50001",
    }),
    null
  );
  assert.equal(
    paidCore.normalizePaidResearchRequest({
      ...valid,
      dailyCostCapAtomic: "1000",
    }),
    null
  );
});

test("typed authorization is bound to Arc Mainnet native USDC and exact quote", () => {
  const parsed = paidCore.parsePaidResearchQuote(sampleQuote());
  assert.ok(parsed);
  assert.equal(parsed.chainId, 5042);
  assert.equal(parsed.network, "eip155:5042");
  assert.equal(
    parsed.typedData.domain.verifyingContract,
    "0x3600000000000000000000000000000000000000"
  );
  assert.equal(parsed.typedData.message.value, "2000");
  assert.equal(
    paidCore.parsePaidResearchQuote({
      ...sampleQuote(),
      resourceUrl: "https://example.com/api",
    }),
    null
  );
});

test("paid receipt fingerprint binds model, evidence, cost and payment", () => {
  const receipt = sampleReceipt();
  const parsed = paidCore.parsePaidResearchReceipt(receipt);
  assert.ok(parsed);
  assert.equal(
    sha256(paidCore.canonicalPaidResearchReceipt(parsed)),
    parsed.receiptHash
  );
  assert.equal(
    paidCore.parsePaidResearchReceipt({
      ...receipt,
      spending: { ...receipt.spending, actualCostAtomic: "6000" },
    }),
    null
  );
  assert.equal(
    paidCore.parsePaidResearchReceipt({
      ...receipt,
      spending: { ...receipt.spending, dailyCostCapAtomic: "1000" },
    }),
    null
  );
  const reorderedMetrics = {
    evidenceScoreBps: receipt.metrics.evidenceScoreBps,
    rangePositionBps: receipt.metrics.rangePositionBps,
    volatilityBps: receipt.metrics.volatilityBps,
    fastTrendBps: receipt.metrics.fastTrendBps,
    horizonReturnBps: receipt.metrics.horizonReturnBps,
  };
  assert.equal(
    paidCore.canonicalPaidResearchReceipt(receipt),
    paidCore.canonicalPaidResearchReceipt({
      ...receipt,
      metrics: reorderedMetrics,
    })
  );
});

test("database atomically reserves spend and makes paid receipts immutable", () => {
  const migration = readFileSync(
    new URL(
      "../supabase/migrations/202610140001_agent_research_mainnet.sql",
      import.meta.url
    ),
    "utf8"
  );
  assert.match(migration, /chain_id = 5042/);
  assert.match(migration, /scheme = 'exact'/);
  assert.match(migration, /daily_cost_cap_atomic.*250000/s);
  assert.match(migration, /pg_advisory_xact_lock/);
  assert.match(migration, /PAID_RESEARCH_DAILY_SPEND_LIMIT/);
  assert.match(migration, /status = 'executing'/);
  assert.match(
    migration,
    /revoke insert, update, delete on public\.predarc_agent_research_paid_receipts/
  );
});

test("paid routes authenticate, recover the signer and never accept a private key", () => {
  const quoteRoute = readFileSync(
    new URL(
      "../src/app/api/agents/research/paid/quote/route.ts",
      import.meta.url
    ),
    "utf8"
  );
  const executeRoute = readFileSync(
    new URL(
      "../src/app/api/agents/research/paid/execute/route.ts",
      import.meta.url
    ),
    "utf8"
  );
  const paidServer = readFileSync(
    new URL("../src/lib/agent-research-paid-server.ts", import.meta.url),
    "utf8"
  );
  const client = readFileSync(
    new URL(
      "../src/app/components/agents/PaidAgentResearchPanel.tsx",
      import.meta.url
    ),
    "utf8"
  );
  assert.ok(
    quoteRoute.indexOf("requestOriginAllowed(request)") < quoteRoute.indexOf(".rpc(")
  );
  assert.ok(
    executeRoute.indexOf("verifyPaidResearchSignature") <
      executeRoute.indexOf("predarc_claim_agent_research_paid_quote_v1")
  );
  assert.match(paidServer, /recoverTypedDataAddress/);
  assert.match(paidServer, /metricsInStoredOrder/);
  assert.match(paidServer, /canonicalLegacyPaidResearchReceipt/);
  assert.match(client, /useSignTypedData/);
  assert.doesNotMatch(`${quoteRoute}\n${executeRoute}\n${client}`, /privateKey/);
});

test("a submitted payment is not automatically retried", () => {
  const paidServer = readFileSync(
    new URL("../src/lib/agent-research-paid-server.ts", import.meta.url),
    "utf8"
  );
  const start = paidServer.indexOf("export async function executePaidResearch");
  const end = paidServer.indexOf("export function serializePaidResearchReceipt");
  const executeSource = paidServer.slice(start, end);
  assert.equal(
    executeSource.match(/fetch\(PAID_RESEARCH_ENDPOINT/g)?.length,
    1
  );
  assert.match(executeSource, /will not retry it automatically/);
});
