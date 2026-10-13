import "server-only";

import { randomBytes } from "node:crypto";
import {
  recoverTypedDataAddress,
  type Address,
  type Hex,
} from "viem";

import {
  PAID_RESEARCH_CHAIN_ID,
  PAID_RESEARCH_ENDPOINT,
  PAID_RESEARCH_ENGINE_ID,
  PAID_RESEARCH_ENGINE_VERSION,
  PAID_RESEARCH_MAX_CALL_ATOMIC,
  PAID_RESEARCH_MODEL,
  PAID_RESEARCH_NETWORK,
  PAID_RESEARCH_PROVIDER,
  PAID_RESEARCH_USDC,
  buildPaidResearchTypedData,
  canonicalLegacyPaidResearchReceipt,
  canonicalPaidResearchReceipt,
  parsePaidResearchQuote,
  parsePaidResearchReceipt,
  type PaidResearchQuote,
  type PaidResearchReceipt,
  type PaidResearchRequest,
} from "@/lib/agent-research-paid-core";
import type {
  AgentResearchAnalysis,
  AgentResearchSignal,
} from "@/lib/agent-research-core";
import {
  collectAgentResearchEvidence,
  sha256Hex,
  type AgentResearchEvidenceBundle,
} from "@/lib/agent-research-server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";

export { sha256Hex } from "@/lib/agent-research-server";

const MAX_PROVIDER_HEADER_LENGTH = 32_000;
const MAX_PROVIDER_RESPONSE_LENGTH = 100_000;
const QUOTE_LIFETIME_SECONDS = 300;

type JsonRecord = Record<string, unknown>;

export type PaidResearchQuoteRow = {
  id: unknown;
  request_id: unknown;
  chain_id: unknown;
  wallet: unknown;
  input_hash: unknown;
  market: unknown;
  duration_seconds: unknown;
  model: unknown;
  max_cost_atomic: unknown;
  daily_cost_cap_atomic: unknown;
  quote_amount_atomic: unknown;
  scheme: unknown;
  network: unknown;
  asset: unknown;
  pay_to: unknown;
  max_timeout_seconds: unknown;
  resource: unknown;
  extensions: unknown;
  payment_extra: unknown;
  authorization_nonce: unknown;
  valid_after: unknown;
  valid_before: unknown;
  request_body: unknown;
  prompt_hash: unknown;
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
  status: unknown;
  actual_cost_atomic: unknown;
  created_at: unknown;
  expires_at: unknown;
};

export type PaidResearchReceiptRow = {
  id: unknown;
  quote_id: unknown;
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
  provider: unknown;
  model: unknown;
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
  prompt_hash: unknown;
  response_hash: unknown;
  authorization_hash: unknown;
  spending_currency: unknown;
  spending_decimals: unknown;
  max_cost_atomic: unknown;
  daily_cost_cap_atomic: unknown;
  actual_cost_atomic: unknown;
  payment_status: unknown;
  payment_scheme: unknown;
  payment_network: unknown;
  payment_asset: unknown;
  payment_pay_to: unknown;
  payment_reference: unknown;
  settlement_transaction: unknown;
  provider_response_id: unknown;
  created_at: unknown;
  receipt_hash: unknown;
};

export const PAID_RESEARCH_QUOTE_COLUMNS = [
  "id",
  "request_id",
  "chain_id",
  "wallet",
  "input_hash",
  "market",
  "duration_seconds",
  "model",
  "max_cost_atomic",
  "daily_cost_cap_atomic",
  "quote_amount_atomic",
  "scheme",
  "network",
  "asset",
  "pay_to",
  "max_timeout_seconds",
  "resource",
  "extensions",
  "payment_extra",
  "authorization_nonce",
  "valid_after",
  "valid_before",
  "request_body",
  "prompt_hash",
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
  "status",
  "actual_cost_atomic",
  "created_at",
  "expires_at",
].join(",");

export const PAID_RESEARCH_RECEIPT_COLUMNS = [
  "id",
  "quote_id",
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
  "provider",
  "model",
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
  "prompt_hash",
  "response_hash",
  "authorization_hash",
  "spending_currency",
  "spending_decimals",
  "max_cost_atomic",
  "daily_cost_cap_atomic",
  "actual_cost_atomic",
  "payment_status",
  "payment_scheme",
  "payment_network",
  "payment_asset",
  "payment_pay_to",
  "payment_reference",
  "settlement_transaction",
  "provider_response_id",
  "created_at",
  "receipt_hash",
].join(",");

export class PaidResearchPaymentRejectedError extends Error {}
export class PaidResearchAmbiguousError extends Error {}

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

const PAID_RESEARCH_METRIC_KEYS = [
  "horizonReturnBps",
  "fastTrendBps",
  "volatilityBps",
  "rangePositionBps",
  "evidenceScoreBps",
] as const;

function metricsInStoredOrder(
  stored: unknown,
  normalized: PaidResearchReceipt["metrics"]
): PaidResearchReceipt["metrics"] {
  const storedKeys = isRecord(stored)
    ? Object.keys(stored).filter((key) =>
        PAID_RESEARCH_METRIC_KEYS.includes(
          key as (typeof PAID_RESEARCH_METRIC_KEYS)[number]
        )
      )
    : [];
  const orderedKeys = [
    ...storedKeys,
    ...PAID_RESEARCH_METRIC_KEYS.filter((key) => !storedKeys.includes(key)),
  ] as (keyof PaidResearchReceipt["metrics"])[];
  return Object.fromEntries(
    orderedKeys.map((key) => [key, normalized[key]])
  ) as PaidResearchReceipt["metrics"];
}

function iso(value: unknown): string {
  const parsed = Date.parse(String(value ?? ""));
  return Number.isFinite(parsed) ? new Date(parsed).toISOString() : "";
}

function jsonSize(value: unknown): number {
  try {
    return JSON.stringify(value).length;
  } catch {
    return Number.POSITIVE_INFINITY;
  }
}

function decodeBase64Json(value: string): unknown {
  if (value.length < 4 || value.length > MAX_PROVIDER_HEADER_LENGTH) {
    throw new Error("Provider payment quote is malformed.");
  }
  try {
    return JSON.parse(Buffer.from(value, "base64").toString("utf8"));
  } catch {
    throw new Error("Provider payment quote is malformed.");
  }
}

function parsePaymentRequirement(value: unknown): {
  amountAtomic: string;
  payTo: string;
  maxTimeoutSeconds: number;
  resource: JsonRecord;
  extensions: JsonRecord;
  extra: JsonRecord;
} {
  if (!isRecord(value) || value.x402Version !== 2 || !Array.isArray(value.accepts)) {
    throw new Error("Provider did not return a supported x402 v2 quote.");
  }
  if (!isRecord(value.resource) || value.resource.url !== PAID_RESEARCH_ENDPOINT) {
    throw new Error("Provider quote resource did not match the allowlist.");
  }
  if (
    value.resource.mimeType !== undefined &&
    value.resource.mimeType !== "application/json"
  ) {
    throw new Error("Provider quote MIME type was not allowed.");
  }

  const option = value.accepts.find(
    (candidate) =>
      isRecord(candidate) &&
      candidate.scheme === "exact" &&
      candidate.network === PAID_RESEARCH_NETWORK
  );
  if (!isRecord(option)) {
    throw new Error("Provider does not currently offer Arc Mainnet exact payment.");
  }

  const amountAtomic = String(option.amount ?? "");
  const payTo = String(option.payTo ?? "").toLowerCase();
  const asset = String(option.asset ?? "").toLowerCase();
  const maxTimeoutSeconds = Number(option.maxTimeoutSeconds);
  const extra = isRecord(option.extra) ? option.extra : {};
  const extensions = isRecord(value.extensions) ? value.extensions : {};

  if (
    !/^[1-9][0-9]{0,8}$/.test(amountAtomic) ||
    BigInt(amountAtomic) > PAID_RESEARCH_MAX_CALL_ATOMIC ||
    !/^0x[0-9a-f]{40}$/.test(payTo) ||
    payTo === "0x0000000000000000000000000000000000000000" ||
    asset !== PAID_RESEARCH_USDC ||
    !Number.isSafeInteger(maxTimeoutSeconds) ||
    maxTimeoutSeconds < 30 ||
    maxTimeoutSeconds > QUOTE_LIFETIME_SECONDS ||
    extra.name !== "USDC" ||
    extra.version !== "2" ||
    jsonSize(value.resource) > 2_000 ||
    jsonSize(extensions) > 4_000 ||
    jsonSize(extra) > 1_000
  ) {
    throw new Error("Provider payment quote failed the Arc Mainnet allowlist.");
  }

  return {
    amountAtomic,
    payTo,
    maxTimeoutSeconds,
    resource: value.resource,
    extensions,
    extra,
  };
}

function buildResearchPrompt(
  request: PaidResearchRequest,
  bundle: AgentResearchEvidenceBundle
): string {
  return [
    `Analyze ${request.market}/USDT for a ${request.durationSeconds}-second forecast horizon.`,
    "Use only the finalized evidence below. Do not invent news, prices, sources, or certainty.",
    "Return only a JSON object with exactly these keys:",
    '{"signal":"higher|lower|neutral","confidence":50-100,"rationale":"20-500 characters"}',
    "Choose neutral when evidence is mixed. This is market research, not financial advice.",
    `Evidence: ${JSON.stringify({
      source: bundle.evidence.source,
      pair: bundle.evidence.pair,
      interval: bundle.evidence.interval,
      sampleCount: bundle.evidence.sampleCount,
      windowStart: bundle.evidence.windowStart,
      windowEnd: bundle.evidence.windowEnd,
      entryPrice: bundle.evidence.entryPrice,
      evidenceHash: bundle.evidence.evidenceHash,
      metrics: bundle.metrics,
      deterministicPreview: {
        signal: bundle.previewAnalysis.signal,
        confidence: bundle.previewAnalysis.confidence,
      },
    })}`,
  ].join("\n");
}

function buildProviderBody(prompt: string): JsonRecord {
  return {
    model: PAID_RESEARCH_MODEL,
    messages: [
      {
        role: "system",
        content:
          "You are Predarc Agent Research. Evaluate supplied market evidence conservatively and output strict JSON only.",
      },
      { role: "user", content: prompt },
    ],
    temperature: 0.1,
    max_tokens: 320,
    response_format: { type: "json_object" },
  };
}

export type PreparedPaidResearchQuote = {
  id: string;
  inputHash: string;
  quote: PaidResearchQuote;
  resource: JsonRecord;
  extensions: JsonRecord;
  paymentExtra: JsonRecord;
  maxTimeoutSeconds: number;
  requestBody: JsonRecord;
  promptHash: string;
  bundle: AgentResearchEvidenceBundle;
};

export async function preparePaidResearchQuote(input: {
  request: PaidResearchRequest;
  wallet: string;
  inputHash: string;
}): Promise<PreparedPaidResearchQuote> {
  const bundle = await collectAgentResearchEvidence(input.request);
  const prompt = buildResearchPrompt(input.request, bundle);
  const requestBody = buildProviderBody(prompt);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15_000);

  let response: Response;
  try {
    response = await fetch(PAID_RESEARCH_ENDPOINT, {
      method: "POST",
      cache: "no-store",
      signal: controller.signal,
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        "User-Agent": "Predarc-Agent-Research/2.0",
      },
      body: JSON.stringify(requestBody),
    });
  } finally {
    clearTimeout(timeout);
  }

  if (response.status !== 402) {
    throw new Error("Paid model did not return an x402 payment quote.");
  }

  let paymentRequired: unknown;
  const header = response.headers.get("payment-required");
  if (header) {
    paymentRequired = decodeBase64Json(header);
  } else {
    const bodyText = await response.text();
    if (bodyText.length > MAX_PROVIDER_HEADER_LENGTH) {
      throw new Error("Provider payment quote is too large.");
    }
    try {
      paymentRequired = JSON.parse(bodyText);
    } catch {
      throw new Error("Provider did not return payment requirements.");
    }
  }

  const requirement = parsePaymentRequirement(paymentRequired);
  if (BigInt(requirement.amountAtomic) > BigInt(input.request.maxCostAtomic)) {
    throw new Error("The current model quote exceeds your per-call USDC cap.");
  }

  const nowSeconds = Math.floor(Date.now() / 1_000);
  const validAfter = String(nowSeconds - 600);
  const validBefore = String(nowSeconds + requirement.maxTimeoutSeconds);
  const nonce = `0x${randomBytes(32).toString("hex")}`;
  const expiresAt = new Date(Number(validBefore) * 1_000).toISOString();
  const quoteId = crypto.randomUUID();
  const typedData = buildPaidResearchTypedData({
    wallet: input.wallet,
    payTo: requirement.payTo,
    amountAtomic: requirement.amountAtomic,
    validAfter,
    validBefore,
    nonce,
  });
  const quote = parsePaidResearchQuote({
    quoteId,
    requestId: input.request.requestId,
    chainId: PAID_RESEARCH_CHAIN_ID,
    wallet: input.wallet,
    market: input.request.market,
    durationSeconds: input.request.durationSeconds,
    model: input.request.model,
    amountAtomic: requirement.amountAtomic,
    maxCostAtomic: input.request.maxCostAtomic,
    dailyCostCapAtomic: input.request.dailyCostCapAtomic,
    currency: "USDC",
    scheme: "exact",
    network: PAID_RESEARCH_NETWORK,
    resourceUrl: PAID_RESEARCH_ENDPOINT,
    expiresAt,
    typedData,
  });
  if (!quote) throw new Error("Predarc could not validate the prepared quote.");

  return {
    id: quoteId,
    inputHash: input.inputHash,
    quote,
    resource: requirement.resource,
    extensions: requirement.extensions,
    paymentExtra: requirement.extra,
    maxTimeoutSeconds: requirement.maxTimeoutSeconds,
    requestBody,
    promptHash: sha256Hex(prompt),
    bundle,
  };
}

export function serializePaidResearchQuote(
  row: PaidResearchQuoteRow
): PaidResearchQuote | null {
  const resource = isRecord(row.resource) ? row.resource : {};
  return parsePaidResearchQuote({
    quoteId: String(row.id ?? ""),
    requestId: String(row.request_id ?? ""),
    chainId: Number(row.chain_id),
    wallet: String(row.wallet ?? ""),
    market: String(row.market ?? ""),
    durationSeconds: Number(row.duration_seconds),
    model: String(row.model ?? ""),
    amountAtomic: String(row.quote_amount_atomic ?? ""),
    maxCostAtomic: String(row.max_cost_atomic ?? ""),
    dailyCostCapAtomic: String(row.daily_cost_cap_atomic ?? ""),
    currency: "USDC",
    scheme: String(row.scheme ?? ""),
    network: String(row.network ?? ""),
    resourceUrl: String(resource.url ?? ""),
    expiresAt: iso(row.expires_at),
    typedData: buildPaidResearchTypedData({
      wallet: String(row.wallet ?? ""),
      payTo: String(row.pay_to ?? ""),
      amountAtomic: String(row.quote_amount_atomic ?? ""),
      validAfter: String(row.valid_after ?? ""),
      validBefore: String(row.valid_before ?? ""),
      nonce: String(row.authorization_nonce ?? ""),
    }),
  });
}

export async function verifyPaidResearchSignature(input: {
  quote: PaidResearchQuote;
  signature: string;
}): Promise<boolean> {
  const typedData = input.quote.typedData;
  const recovered = await recoverTypedDataAddress({
    domain: {
      ...typedData.domain,
      verifyingContract: typedData.domain.verifyingContract as Address,
    },
    types: typedData.types,
    primaryType: typedData.primaryType,
    message: {
      from: typedData.message.from as Address,
      to: typedData.message.to as Address,
      value: BigInt(typedData.message.value),
      validAfter: BigInt(typedData.message.validAfter),
      validBefore: BigInt(typedData.message.validBefore),
      nonce: typedData.message.nonce as Hex,
    },
    signature: input.signature as Hex,
  });
  return recovered.toLowerCase() === input.quote.wallet.toLowerCase();
}

function withBlockRunBuilderCode(extensions: JsonRecord): JsonRecord {
  const existing = isRecord(extensions["builder-code"])
    ? extensions["builder-code"]
    : {};
  const existingInfo = isRecord(existing.info) ? existing.info : {};
  return {
    ...extensions,
    "builder-code": {
      ...existing,
      info: { ...existingInfo, s: ["blockrun"] },
    },
  };
}

function paymentPayload(input: {
  row: PaidResearchQuoteRow;
  quote: PaidResearchQuote;
  signature: string;
}): string {
  const resource = isRecord(input.row.resource) ? input.row.resource : {};
  const extensions = isRecord(input.row.extensions) ? input.row.extensions : {};
  const extra = isRecord(input.row.payment_extra) ? input.row.payment_extra : {};
  const data = {
    x402Version: 2,
    resource,
    accepted: {
      scheme: "exact",
      network: PAID_RESEARCH_NETWORK,
      amount: input.quote.amountAtomic,
      asset: PAID_RESEARCH_USDC,
      payTo: input.quote.typedData.message.to,
      maxTimeoutSeconds: Number(input.row.max_timeout_seconds),
      extra,
    },
    payload: {
      signature: input.signature,
      authorization: {
        from: input.quote.typedData.message.from,
        to: input.quote.typedData.message.to,
        value: input.quote.typedData.message.value,
        validAfter: input.quote.typedData.message.validAfter,
        validBefore: input.quote.typedData.message.validBefore,
        nonce: input.quote.typedData.message.nonce,
      },
    },
    extensions: withBlockRunBuilderCode(extensions),
  };
  return Buffer.from(JSON.stringify(data), "utf8").toString("base64");
}

function parseModelAnalysis(content: unknown): AgentResearchAnalysis {
  if (typeof content !== "string" || content.length > 4_000) {
    throw new PaidResearchAmbiguousError("Paid model response was malformed.");
  }
  const cleaned = content
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/, "");
  let parsed: unknown;
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    throw new PaidResearchAmbiguousError("Paid model returned invalid JSON.");
  }
  if (!isRecord(parsed)) {
    throw new PaidResearchAmbiguousError("Paid model response was not an object.");
  }
  const keys = Object.keys(parsed).sort().join(",");
  const signal = parsed.signal;
  const confidence = parsed.confidence;
  const rationale = parsed.rationale;
  if (
    keys !== "confidence,rationale,signal" ||
    (signal !== "higher" && signal !== "lower" && signal !== "neutral") ||
    !Number.isSafeInteger(confidence) ||
    Number(confidence) < 50 ||
    Number(confidence) > 100 ||
    typeof rationale !== "string" ||
    rationale.length < 20 ||
    rationale.length > 500
  ) {
    throw new PaidResearchAmbiguousError("Paid model response failed validation.");
  }
  return {
    signal: signal as AgentResearchSignal,
    confidence: Number(confidence),
    rationale,
    metrics: {
      horizonReturnBps: 0,
      fastTrendBps: 0,
      volatilityBps: 0,
      rangePositionBps: 0,
      evidenceScoreBps: 0,
    },
  };
}

function readSettlement(response: Response, amountAtomic: string): {
  actualCostAtomic: string;
  status: "settled" | "not-charged";
  settlementTransaction: string | null;
  paymentReference: string | null;
} {
  const skipped = response.headers.get("x-settlement-skipped") === "free-fallback";
  const header =
    response.headers.get("payment-response") ??
    response.headers.get("x-payment-response");
  let settlement: JsonRecord | null = null;
  if (header) {
    const decoded = decodeBase64Json(header);
    settlement = isRecord(decoded) ? decoded : null;
  }
  if (settlement?.success === false) {
    throw new PaidResearchAmbiguousError("Provider reported failed settlement.");
  }
  const extra = isRecord(settlement?.extra) ? settlement?.extra : null;
  const charged = String(extra?.chargedAmount ?? settlement?.amount ?? amountAtomic);
  if (!/^(0|[1-9][0-9]{0,8})$/.test(charged) || BigInt(charged) > BigInt(amountAtomic)) {
    throw new PaidResearchAmbiguousError("Provider settlement amount was invalid.");
  }
  const transactionCandidate =
    (typeof settlement?.transaction === "string" ? settlement.transaction : "") ||
    response.headers.get("x-payment-receipt") ||
    "";
  const settlementTransaction = /^0x[0-9a-f]{64}$/i.test(transactionCandidate)
    ? transactionCandidate.toLowerCase()
    : null;
  return {
    actualCostAtomic: skipped ? "0" : charged,
    status: skipped ? "not-charged" : "settled",
    settlementTransaction,
    paymentReference: settlementTransaction,
  };
}

export async function executePaidResearch(input: {
  row: PaidResearchQuoteRow;
  quote: PaidResearchQuote;
  signature: string;
}): Promise<PaidResearchReceipt> {
  if (!isRecord(input.row.request_body)) {
    throw new Error("Stored paid research request is invalid.");
  }
  const encodedPayment = paymentPayload(input);
  const authorizationHash = sha256Hex(encodedPayment);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 90_000);
  let response: Response;
  try {
    response = await fetch(PAID_RESEARCH_ENDPOINT, {
      method: "POST",
      cache: "no-store",
      signal: controller.signal,
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        "PAYMENT-SIGNATURE": encodedPayment,
        "User-Agent": "Predarc-Agent-Research/2.0",
      },
      body: JSON.stringify(input.row.request_body),
    });
  } catch {
    throw new PaidResearchAmbiguousError(
      "The paid request outcome is unknown; Predarc will not retry it automatically."
    );
  } finally {
    clearTimeout(timeout);
  }

  if (response.status === 402) {
    throw new PaidResearchPaymentRejectedError(
      "The payment authorization was rejected. Check Arc Mainnet USDC balance and quote expiry."
    );
  }
  if (!response.ok) {
    throw new PaidResearchAmbiguousError(
      "The provider returned an error after payment submission; no automatic retry was made."
    );
  }

  const raw = await response.text();
  if (raw.length < 2 || raw.length > MAX_PROVIDER_RESPONSE_LENGTH) {
    throw new PaidResearchAmbiguousError("Provider response size was invalid.");
  }
  let providerBody: unknown;
  try {
    providerBody = JSON.parse(raw);
  } catch {
    throw new PaidResearchAmbiguousError("Provider response was not JSON.");
  }
  if (!isRecord(providerBody) || !Array.isArray(providerBody.choices)) {
    throw new PaidResearchAmbiguousError("Provider response shape was invalid.");
  }
  const firstChoice = providerBody.choices[0];
  const message = isRecord(firstChoice) && isRecord(firstChoice.message)
    ? firstChoice.message
    : null;
  const analysis = parseModelAnalysis(message?.content);
  const providerResponseId = String(providerBody.id ?? "");
  if (!providerResponseId || providerResponseId.length > 200) {
    throw new PaidResearchAmbiguousError("Provider response ID was invalid.");
  }
  const settlement = readSettlement(response, input.quote.amountAtomic);
  const paymentReference =
    settlement.paymentReference ?? `authorization:${authorizationHash}`;
  const payload: Omit<PaidResearchReceipt, "receiptHash"> = {
    id: crypto.randomUUID(),
    quoteId: input.quote.quoteId,
    requestId: input.quote.requestId,
    chainId: PAID_RESEARCH_CHAIN_ID,
    wallet: input.quote.wallet,
    market: input.quote.market,
    durationSeconds: input.quote.durationSeconds,
    signal: analysis.signal,
    confidence: analysis.confidence,
    rationale: analysis.rationale,
    engine: {
      id: PAID_RESEARCH_ENGINE_ID,
      version: PAID_RESEARCH_ENGINE_VERSION,
      mode: "paid-ai",
      provider: PAID_RESEARCH_PROVIDER,
      model: PAID_RESEARCH_MODEL,
    },
    evidence: {
      source: "Binance public market data",
      pair: String(input.row.evidence_pair ?? ""),
      interval: "1m",
      sampleCount: Number(input.row.evidence_sample_count),
      windowStart: iso(input.row.evidence_window_start),
      windowEnd: iso(input.row.evidence_window_end),
      observedAt: iso(input.row.evidence_observed_at),
      entryPrice: String(input.row.evidence_entry_price ?? ""),
      evidenceHash: String(input.row.evidence_hash ?? ""),
    },
    metrics: input.row.metrics as PaidResearchReceipt["metrics"],
    verification: {
      promptHash: String(input.row.prompt_hash ?? ""),
      responseHash: sha256Hex(raw),
      authorizationHash,
    },
    spending: {
      currency: "USDC",
      decimals: 6,
      maxCostAtomic: input.quote.maxCostAtomic,
      dailyCostCapAtomic: input.quote.dailyCostCapAtomic,
      actualCostAtomic: settlement.actualCostAtomic,
      status: settlement.status,
      scheme: "exact",
      network: PAID_RESEARCH_NETWORK,
      asset: PAID_RESEARCH_USDC,
      payTo: input.quote.typedData.message.to,
      paymentReference,
      settlementTransaction: settlement.settlementTransaction,
    },
    providerResponseId,
    createdAt: new Date().toISOString(),
  };
  const normalized = parsePaidResearchReceipt({
    ...payload,
    receiptHash: "0".repeat(64),
  });
  if (!normalized) {
    throw new PaidResearchAmbiguousError("Paid receipt failed local verification.");
  }
  const parsed: PaidResearchReceipt = {
    ...normalized,
    receiptHash: sha256Hex(canonicalPaidResearchReceipt(normalized)),
  };
  if (!verifyPaidResearchReceipt(parsed)) {
    throw new PaidResearchAmbiguousError("Paid receipt fingerprint failed locally.");
  }
  return parsed;
}

export function serializePaidResearchReceipt(
  row: PaidResearchReceiptRow
): PaidResearchReceipt | null {
  const parsed = parsePaidResearchReceipt({
    id: String(row.id ?? ""),
    quoteId: String(row.quote_id ?? ""),
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
      provider: String(row.provider ?? ""),
      model: String(row.model ?? ""),
    },
    evidence: {
      source: String(row.evidence_source ?? ""),
      pair: String(row.evidence_pair ?? ""),
      interval: String(row.evidence_interval ?? ""),
      sampleCount: Number(row.evidence_sample_count),
      windowStart: iso(row.evidence_window_start),
      windowEnd: iso(row.evidence_window_end),
      observedAt: iso(row.evidence_observed_at),
      entryPrice: String(row.evidence_entry_price ?? ""),
      evidenceHash: String(row.evidence_hash ?? ""),
    },
    metrics: row.metrics,
    verification: {
      promptHash: String(row.prompt_hash ?? ""),
      responseHash: String(row.response_hash ?? ""),
      authorizationHash: String(row.authorization_hash ?? ""),
    },
    spending: {
      currency: String(row.spending_currency ?? ""),
      decimals: Number(row.spending_decimals),
      maxCostAtomic: String(row.max_cost_atomic ?? ""),
      dailyCostCapAtomic: String(row.daily_cost_cap_atomic ?? ""),
      actualCostAtomic: String(row.actual_cost_atomic ?? ""),
      status: String(row.payment_status ?? ""),
      scheme: String(row.payment_scheme ?? ""),
      network: String(row.payment_network ?? ""),
      asset: String(row.payment_asset ?? ""),
      payTo: String(row.payment_pay_to ?? ""),
      paymentReference: String(row.payment_reference ?? ""),
      settlementTransaction:
        row.settlement_transaction === null
          ? null
          : String(row.settlement_transaction ?? ""),
    },
    providerResponseId: String(row.provider_response_id ?? ""),
    createdAt: iso(row.created_at),
    receiptHash: String(row.receipt_hash ?? ""),
  });
  return parsed
    ? { ...parsed, metrics: metricsInStoredOrder(row.metrics, parsed.metrics) }
    : null;
}

export function verifyPaidResearchReceipt(receipt: PaidResearchReceipt): boolean {
  if (sha256Hex(canonicalPaidResearchReceipt(receipt)) === receipt.receiptHash) {
    return true;
  }
  return (
    sha256Hex(canonicalLegacyPaidResearchReceipt(receipt)) ===
    receipt.receiptHash
  );
}

export async function getPaidResearchReceiptById(
  id: string
): Promise<PaidResearchReceipt | null> {
  const { data, error } = await getSupabaseAdmin()
    .from("predarc_agent_research_paid_receipts")
    .select(PAID_RESEARCH_RECEIPT_COLUMNS)
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error("Paid research receipt lookup failed.");
  return data
    ? serializePaidResearchReceipt(data as unknown as PaidResearchReceiptRow)
    : null;
}
