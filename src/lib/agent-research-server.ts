import "server-only";

import { createHash } from "node:crypto";

import {
  AGENT_RESEARCH_ENGINE_ID,
  AGENT_RESEARCH_ENGINE_VERSION,
  buildAgentResearchAnalysis,
  canonicalAgentResearchReceipt,
  type AgentResearchDuration,
  type AgentResearchMarket,
  type AgentResearchReceipt,
  parseAgentResearchReceipt,
} from "@/lib/agent-research-core";
import { getSupabaseAdmin } from "@/lib/supabase-admin";

const BINANCE_ENDPOINTS = [
  "https://data-api.binance.vision",
  "https://api.binance.com",
  "https://api-gcp.binance.com",
];

type BinanceKline = [
  number,
  string,
  string,
  string,
  string,
  string,
  number,
  string,
  number,
  string,
  string,
  string,
];

export type AgentResearchReceiptRow = {
  id: unknown;
  request_id: unknown;
  chain_id: unknown;
  wallet: unknown;
  market: unknown;
  duration_seconds: unknown;
  signal: unknown;
  confidence: unknown;
  rationale: unknown;
  engine_id: unknown;
  engine_version: unknown;
  engine_mode: unknown;
  evidence_source: unknown;
  evidence_pair: unknown;
  evidence_interval: unknown;
  evidence_sample_count: unknown;
  evidence_window_start: unknown;
  evidence_window_end: unknown;
  evidence_observed_at: unknown;
  evidence_entry_price: unknown;
  evidence_hash: unknown;
  metrics: unknown;
  spending_currency: unknown;
  spending_decimals: unknown;
  max_cost_atomic: unknown;
  actual_cost_atomic: unknown;
  payment_status: unknown;
  payment_reference: unknown;
  created_at: unknown;
  receipt_hash: unknown;
  input_hash?: unknown;
};

export const AGENT_RESEARCH_RECEIPT_COLUMNS = [
  "id",
  "request_id",
  "chain_id",
  "wallet",
  "market",
  "duration_seconds",
  "signal",
  "confidence",
  "rationale",
  "engine_id",
  "engine_version",
  "engine_mode",
  "evidence_source",
  "evidence_pair",
  "evidence_interval",
  "evidence_sample_count",
  "evidence_window_start",
  "evidence_window_end",
  "evidence_observed_at",
  "evidence_entry_price",
  "evidence_hash",
  "metrics",
  "spending_currency",
  "spending_decimals",
  "max_cost_atomic",
  "actual_cost_atomic",
  "payment_status",
  "payment_reference",
  "created_at",
  "receipt_hash",
].join(",");

export function sha256Hex(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function normalizeIsoTimestamp(value: unknown): string {
  const timestamp = Date.parse(String(value ?? ""));
  return Number.isFinite(timestamp) ? new Date(timestamp).toISOString() : "";
}

async function fetchBinanceKlines(
  market: AgentResearchMarket
): Promise<BinanceKline[]> {
  let lastError: Error | null = null;

  for (const baseUrl of BINANCE_ENDPOINTS) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8_000);

    try {
      const url = new URL("/api/v3/klines", baseUrl);
      url.searchParams.set("symbol", `${market}USDT`);
      url.searchParams.set("interval", "1m");
      url.searchParams.set("limit", "121");

      const response = await fetch(url, {
        cache: "no-store",
        signal: controller.signal,
        headers: { Accept: "application/json" },
      });

      if (!response.ok) {
        throw new Error(`Binance returned HTTP ${response.status}.`);
      }

      const result = await response.json();
      if (!Array.isArray(result)) {
        throw new Error("Binance returned an invalid candle response.");
      }

      return result as BinanceKline[];
    } catch (error) {
      lastError =
        error instanceof Error
          ? error
          : new Error("Unknown Binance market-data error.");
    } finally {
      clearTimeout(timeout);
    }
  }

  throw lastError ?? new Error("All Binance market-data endpoints failed.");
}

export async function createAgentResearchReceipt(input: {
  id: string;
  requestId: string;
  chainId: number;
  wallet: string;
  market: AgentResearchMarket;
  durationSeconds: AgentResearchDuration;
  maxCostAtomic: string;
  createdAt: string;
}): Promise<AgentResearchReceipt> {
  const result = await fetchBinanceKlines(input.market);
  const now = Date.now();
  const completed = result
    .filter((kline) => {
      const closeTime = Number(kline[6]);
      return Number.isSafeInteger(closeTime) && closeTime <= now;
    })
    .slice(-120);

  const candles = completed.map((kline) => ({
    openTime: Number(kline[0]),
    closeTime: Number(kline[6]),
    open: Number(kline[1]),
    high: Number(kline[2]),
    low: Number(kline[3]),
    close: Number(kline[4]),
  }));
  const analysis = buildAgentResearchAnalysis(
    candles,
    input.durationSeconds
  );
  const first = completed[0];
  const last = completed.at(-1);

  if (!analysis || !first || !last) {
    throw new Error("Not enough finalized market evidence was available.");
  }

  const evidenceHash = sha256Hex(
    JSON.stringify({
      version: 1,
      market: input.market,
      pair: `${input.market}USDT`,
      interval: "1m",
      candles: completed.map((kline) => [
        String(kline[0]),
        String(kline[6]),
        String(kline[1]),
        String(kline[2]),
        String(kline[3]),
        String(kline[4]),
      ]),
    })
  );
  const payload: Omit<AgentResearchReceipt, "receiptHash"> = {
    id: input.id,
    requestId: input.requestId,
    chainId: input.chainId,
    wallet: input.wallet.toLowerCase(),
    market: input.market,
    durationSeconds: input.durationSeconds,
    signal: analysis.signal,
    confidence: analysis.confidence,
    rationale: analysis.rationale,
    engine: {
      id: AGENT_RESEARCH_ENGINE_ID,
      version: AGENT_RESEARCH_ENGINE_VERSION,
      mode: "deterministic-preview",
    },
    evidence: {
      source: "Binance public market data",
      pair: `${input.market}/USDT`,
      interval: "1m",
      sampleCount: completed.length,
      windowStart: new Date(Number(first[0])).toISOString(),
      windowEnd: new Date(Number(last[6])).toISOString(),
      observedAt: new Date(Number(last[6])).toISOString(),
      entryPrice: String(last[4]),
      evidenceHash,
    },
    metrics: analysis.metrics,
    spending: {
      currency: "USDC",
      decimals: 6,
      maxCostAtomic: input.maxCostAtomic,
      actualCostAtomic: "0",
      status: "not-charged",
      paymentReference: null,
    },
    createdAt: input.createdAt,
  };

  return {
    ...payload,
    receiptHash: sha256Hex(canonicalAgentResearchReceipt(payload)),
  };
}

export function serializeAgentResearchRow(
  row: AgentResearchReceiptRow
): AgentResearchReceipt | null {
  return parseAgentResearchReceipt({
    id: String(row.id ?? ""),
    requestId: String(row.request_id ?? ""),
    chainId: Number(row.chain_id),
    wallet: String(row.wallet ?? ""),
    market: String(row.market ?? ""),
    durationSeconds: Number(row.duration_seconds),
    signal: String(row.signal ?? ""),
    confidence: Number(row.confidence),
    rationale: String(row.rationale ?? ""),
    engine: {
      id: String(row.engine_id ?? ""),
      version: String(row.engine_version ?? ""),
      mode: String(row.engine_mode ?? ""),
    },
    evidence: {
      source: String(row.evidence_source ?? ""),
      pair: String(row.evidence_pair ?? ""),
      interval: String(row.evidence_interval ?? ""),
      sampleCount: Number(row.evidence_sample_count),
      windowStart: normalizeIsoTimestamp(row.evidence_window_start),
      windowEnd: normalizeIsoTimestamp(row.evidence_window_end),
      observedAt: normalizeIsoTimestamp(row.evidence_observed_at),
      entryPrice: String(row.evidence_entry_price ?? ""),
      evidenceHash: String(row.evidence_hash ?? ""),
    },
    metrics: row.metrics,
    spending: {
      currency: String(row.spending_currency ?? ""),
      decimals: Number(row.spending_decimals),
      maxCostAtomic: String(row.max_cost_atomic ?? ""),
      actualCostAtomic: String(row.actual_cost_atomic ?? ""),
      status: String(row.payment_status ?? ""),
      paymentReference:
        row.payment_reference === null
          ? null
          : String(row.payment_reference ?? ""),
    },
    createdAt: normalizeIsoTimestamp(row.created_at),
    receiptHash: String(row.receipt_hash ?? ""),
  });
}

export function verifyAgentResearchReceipt(
  receipt: AgentResearchReceipt
): boolean {
  return (
    sha256Hex(canonicalAgentResearchReceipt(receipt)) === receipt.receiptHash
  );
}

export async function getAgentResearchReceiptById(
  id: string
): Promise<AgentResearchReceipt | null> {
  const { data, error } = await getSupabaseAdmin()
    .from("predarc_agent_research_receipts")
    .select(AGENT_RESEARCH_RECEIPT_COLUMNS)
    .eq("id", id)
    .maybeSingle();

  if (error) throw new Error("Research receipt lookup failed.");
  return data
    ? serializeAgentResearchRow(data as unknown as AgentResearchReceiptRow)
    : null;
}
