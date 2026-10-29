import {
  AGENT_RESEARCH_DURATIONS,
  AGENT_RESEARCH_MARKETS,
  isAgentResearchUuid,
  type AgentResearchDuration,
  type AgentResearchMarket,
  type AgentResearchMetrics,
  type AgentResearchSignal,
} from "@/lib/agent-research-core";
import {
  ARC_MAINNET_CHAIN_ID,
  getPredarcNetwork,
  normalizePredarcChainId,
  type PredarcChainId,
} from "@/lib/predarc-networks";

// Arc aliases remain exported for backwards-compatible receipt verification.
export const PAID_RESEARCH_CHAIN_ID = ARC_MAINNET_CHAIN_ID;
export const PAID_RESEARCH_NETWORK = "eip155:5042" as const;
export const PAID_RESEARCH_USDC =
  "0x3600000000000000000000000000000000000000" as const;
export const PAID_RESEARCH_ENDPOINT =
  "https://arc.blockrun.ai/api/v1/chat/completions" as const;
export const PAID_RESEARCH_PROVIDER = "BlockRun";
export const PAID_RESEARCH_MODEL = "google/gemini-2.5-flash";
export const PAID_RESEARCH_ENGINE_ID = "predarc-agent-research";
export const PAID_RESEARCH_ENGINE_VERSION = "2.0.0";
export const PAID_RESEARCH_DAILY_LIMIT = 10;
export const PAID_RESEARCH_MAX_CALL_ATOMIC = 50_000n;
export const PAID_RESEARCH_MAX_DAILY_ATOMIC = 250_000n;

export type PaidResearchConfig = {
  chainId: PredarcChainId;
  network: `eip155:${PredarcChainId}`;
  usdc: `0x${string}`;
  endpoint: string;
  domainName: "USDC" | "USD Coin";
};

export function getPaidResearchConfig(
  chainId: PredarcChainId
): PaidResearchConfig {
  const network = getPredarcNetwork(chainId);
  return {
    chainId,
    network: network.blockRunNetwork,
    usdc: network.usdcAddress.toLowerCase() as `0x${string}`,
    endpoint: network.blockRunEndpoint,
    domainName: chainId === ARC_MAINNET_CHAIN_ID ? "USDC" : "USD Coin",
  };
}

export const PAID_RESEARCH_CALL_CAPS = ["5000", "10000", "25000", "50000"] as const;
export const PAID_RESEARCH_DAILY_CAPS = [
  "10000",
  "25000",
  "50000",
  "100000",
  "250000",
] as const;

export const PAID_RESEARCH_TRANSFER_TYPES = {
  TransferWithAuthorization: [
    { name: "from", type: "address" },
    { name: "to", type: "address" },
    { name: "value", type: "uint256" },
    { name: "validAfter", type: "uint256" },
    { name: "validBefore", type: "uint256" },
    { name: "nonce", type: "bytes32" },
  ],
} as const;

export type PaidResearchRequest = {
  requestId: string;
  market: AgentResearchMarket;
  durationSeconds: AgentResearchDuration;
  model: typeof PAID_RESEARCH_MODEL;
  maxCostAtomic: string;
  dailyCostCapAtomic: string;
};

export type PaidResearchTypedData = {
  domain: {
    name: "USDC" | "USD Coin";
    version: "2";
    chainId: PredarcChainId;
    verifyingContract: `0x${string}`;
  };
  types: typeof PAID_RESEARCH_TRANSFER_TYPES;
  primaryType: "TransferWithAuthorization";
  message: {
    from: string;
    to: string;
    value: string;
    validAfter: string;
    validBefore: string;
    nonce: string;
  };
};

export type PaidResearchQuote = {
  quoteId: string;
  requestId: string;
  chainId: PredarcChainId;
  wallet: string;
  market: AgentResearchMarket;
  durationSeconds: AgentResearchDuration;
  model: typeof PAID_RESEARCH_MODEL;
  amountAtomic: string;
  maxCostAtomic: string;
  dailyCostCapAtomic: string;
  currency: "USDC";
  scheme: "exact";
  network: `eip155:${PredarcChainId}`;
  resourceUrl: string;
  expiresAt: string;
  typedData: PaidResearchTypedData;
};

export type PaidResearchReceipt = {
  id: string;
  quoteId: string;
  requestId: string;
  chainId: PredarcChainId;
  wallet: string;
  market: AgentResearchMarket;
  durationSeconds: AgentResearchDuration;
  signal: AgentResearchSignal;
  confidence: number;
  rationale: string;
  engine: {
    id: typeof PAID_RESEARCH_ENGINE_ID;
    version: typeof PAID_RESEARCH_ENGINE_VERSION;
    mode: "paid-ai";
    provider: typeof PAID_RESEARCH_PROVIDER;
    model: typeof PAID_RESEARCH_MODEL;
  };
  evidence: {
    source: "Binance public market data";
    pair: string;
    interval: "1m";
    sampleCount: number;
    windowStart: string;
    windowEnd: string;
    observedAt: string;
    entryPrice: string;
    evidenceHash: string;
  };
  metrics: AgentResearchMetrics;
  verification: {
    promptHash: string;
    responseHash: string;
    authorizationHash: string;
  };
  spending: {
    currency: "USDC";
    decimals: 6;
    maxCostAtomic: string;
    dailyCostCapAtomic: string;
    actualCostAtomic: string;
    status: "settled" | "not-charged";
    scheme: "exact";
    network: `eip155:${PredarcChainId}`;
    asset: `0x${string}`;
    payTo: string;
    paymentReference: string;
    settlementTransaction: string | null;
  };
  providerResponseId: string;
  createdAt: string;
  receiptHash: string;
};

export type PaidResearchExecuteResponse = {
  receipt: PaidResearchReceipt;
  replayed: boolean;
  verification: "verified";
};

const HASH_PATTERN = /^[0-9a-f]{64}$/;
const HEX_32_PATTERN = /^0x[0-9a-f]{64}$/i;
const ADDRESS_PATTERN = /^0x[0-9a-f]{40}$/i;
const SIGNATURE_PATTERN = /^0x[0-9a-f]{130}$/i;
const DECIMAL_PATTERN = /^(0|[1-9][0-9]*)(\.[0-9]{1,18})?$/;
const PAYMENT_REFERENCE_PATTERN = /^(0x[0-9a-f]{64}|authorization:[0-9a-f]{64})$/i;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isWholeNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value);
}

function isIsoDate(value: unknown): value is string {
  return (
    typeof value === "string" &&
    Number.isFinite(Date.parse(value)) &&
    new Date(value).toISOString() === value
  );
}

function normalizeAtomic(
  value: unknown,
  maximum: bigint,
  allowZero = false
): string | null {
  const normalized =
    typeof value === "number" && Number.isSafeInteger(value)
      ? String(value)
      : typeof value === "string"
        ? value
        : "";

  if (!/^(0|[1-9][0-9]{0,8})$/.test(normalized)) return null;
  const amount = BigInt(normalized);
  if ((!allowZero && amount === 0n) || amount > maximum) return null;
  return normalized;
}

function isMarket(value: unknown): value is AgentResearchMarket {
  return (
    typeof value === "string" &&
    AGENT_RESEARCH_MARKETS.includes(value as AgentResearchMarket)
  );
}

function isDuration(value: unknown): value is AgentResearchDuration {
  return (
    isWholeNumber(value) &&
    AGENT_RESEARCH_DURATIONS.includes(value as AgentResearchDuration)
  );
}

function isSignal(value: unknown): value is AgentResearchSignal {
  return value === "higher" || value === "lower" || value === "neutral";
}

function parseMetrics(value: unknown): AgentResearchMetrics | null {
  if (!isRecord(value)) return null;
  const keys: (keyof AgentResearchMetrics)[] = [
    "horizonReturnBps",
    "fastTrendBps",
    "volatilityBps",
    "rangePositionBps",
    "evidenceScoreBps",
  ];
  if (!keys.every((key) => isWholeNumber(value[key]))) return null;
  return {
    horizonReturnBps: value.horizonReturnBps as number,
    fastTrendBps: value.fastTrendBps as number,
    volatilityBps: value.volatilityBps as number,
    rangePositionBps: value.rangePositionBps as number,
    evidenceScoreBps: value.evidenceScoreBps as number,
  };
}

export function normalizePaidResearchRequest(
  value: unknown
): PaidResearchRequest | null {
  if (!isRecord(value)) return null;
  const requestId =
    typeof value.requestId === "string" ? value.requestId.toLowerCase() : "";
  const maxCostAtomic = normalizeAtomic(
    value.maxCostAtomic,
    PAID_RESEARCH_MAX_CALL_ATOMIC
  );
  const dailyCostCapAtomic = normalizeAtomic(
    value.dailyCostCapAtomic,
    PAID_RESEARCH_MAX_DAILY_ATOMIC
  );

  if (
    !isAgentResearchUuid(requestId) ||
    !isMarket(value.market) ||
    !isDuration(value.durationSeconds) ||
    value.model !== PAID_RESEARCH_MODEL ||
    maxCostAtomic === null ||
    dailyCostCapAtomic === null ||
    BigInt(dailyCostCapAtomic) < BigInt(maxCostAtomic)
  ) {
    return null;
  }

  return {
    requestId,
    market: value.market,
    durationSeconds: value.durationSeconds,
    model: PAID_RESEARCH_MODEL,
    maxCostAtomic,
    dailyCostCapAtomic,
  };
}

export function canonicalPaidResearchRequest(input: {
  request: PaidResearchRequest;
  wallet: string;
  chainId?: PredarcChainId;
}): string {
  const chainId = input.chainId ?? PAID_RESEARCH_CHAIN_ID;
  return JSON.stringify({
    version: 1,
    requestId: input.request.requestId,
    chainId,
    wallet: input.wallet.toLowerCase(),
    market: input.request.market,
    durationSeconds: input.request.durationSeconds,
    model: input.request.model,
    maxCostAtomic: input.request.maxCostAtomic,
    dailyCostCapAtomic: input.request.dailyCostCapAtomic,
  });
}

export function buildPaidResearchTypedData(input: {
  chainId?: PredarcChainId;
  wallet: string;
  payTo: string;
  amountAtomic: string;
  validAfter: string;
  validBefore: string;
  nonce: string;
}): PaidResearchTypedData {
  const config = getPaidResearchConfig(
    input.chainId ?? PAID_RESEARCH_CHAIN_ID
  );
  return {
    domain: {
      name: config.domainName,
      version: "2",
      chainId: config.chainId,
      verifyingContract: config.usdc,
    },
    types: PAID_RESEARCH_TRANSFER_TYPES,
    primaryType: "TransferWithAuthorization",
    message: {
      from: input.wallet.toLowerCase(),
      to: input.payTo.toLowerCase(),
      value: input.amountAtomic,
      validAfter: input.validAfter,
      validBefore: input.validBefore,
      nonce: input.nonce.toLowerCase(),
    },
  };
}

export function parsePaidResearchQuote(value: unknown): PaidResearchQuote | null {
  if (!isRecord(value) || !isRecord(value.typedData)) return null;
  const chainId = normalizePredarcChainId(value.chainId);
  if (!chainId) return null;
  const config = getPaidResearchConfig(chainId);
  const typedData = value.typedData;
  const domain = typedData.domain;
  const message = typedData.message;
  const types = typedData.types;
  const amountAtomic = normalizeAtomic(
    value.amountAtomic,
    PAID_RESEARCH_MAX_CALL_ATOMIC
  );
  const maxCostAtomic = normalizeAtomic(
    value.maxCostAtomic,
    PAID_RESEARCH_MAX_CALL_ATOMIC
  );
  const dailyCostCapAtomic = normalizeAtomic(
    value.dailyCostCapAtomic,
    PAID_RESEARCH_MAX_DAILY_ATOMIC
  );

  if (
    !isAgentResearchUuid(value.quoteId) ||
    !isAgentResearchUuid(value.requestId) ||
    typeof value.wallet !== "string" ||
    !ADDRESS_PATTERN.test(value.wallet) ||
    !isMarket(value.market) ||
    !isDuration(value.durationSeconds) ||
    value.model !== PAID_RESEARCH_MODEL ||
    amountAtomic === null ||
    maxCostAtomic === null ||
    dailyCostCapAtomic === null ||
    BigInt(amountAtomic) > BigInt(maxCostAtomic) ||
    BigInt(maxCostAtomic) > BigInt(dailyCostCapAtomic) ||
    value.currency !== "USDC" ||
    value.scheme !== "exact" ||
    value.network !== config.network ||
    value.resourceUrl !== config.endpoint ||
    !isIsoDate(value.expiresAt) ||
    !isRecord(domain) ||
    domain.name !== config.domainName ||
    domain.version !== "2" ||
    domain.chainId !== chainId ||
    String(domain.verifyingContract).toLowerCase() !== config.usdc ||
    typedData.primaryType !== "TransferWithAuthorization" ||
    JSON.stringify(types) !== JSON.stringify(PAID_RESEARCH_TRANSFER_TYPES) ||
    !isRecord(message) ||
    String(message.from).toLowerCase() !== String(value.wallet).toLowerCase() ||
    typeof message.to !== "string" ||
    !ADDRESS_PATTERN.test(message.to) ||
    message.value !== amountAtomic ||
    typeof message.validAfter !== "string" ||
    !/^\d{1,12}$/.test(message.validAfter) ||
    typeof message.validBefore !== "string" ||
    !/^\d{1,12}$/.test(message.validBefore) ||
    BigInt(message.validAfter) >= BigInt(message.validBefore) ||
    typeof message.nonce !== "string" ||
    !HEX_32_PATTERN.test(message.nonce)
  ) {
    return null;
  }

  return {
    quoteId: value.quoteId,
    requestId: value.requestId,
    chainId,
    wallet: value.wallet.toLowerCase(),
    market: value.market,
    durationSeconds: value.durationSeconds,
    model: PAID_RESEARCH_MODEL,
    amountAtomic,
    maxCostAtomic,
    dailyCostCapAtomic,
    currency: "USDC",
    scheme: "exact",
    network: config.network,
    resourceUrl: config.endpoint,
    expiresAt: value.expiresAt,
    typedData: {
      domain: {
        name: config.domainName,
        version: "2",
        chainId,
        verifyingContract: config.usdc,
      },
      types: PAID_RESEARCH_TRANSFER_TYPES,
      primaryType: "TransferWithAuthorization",
      message: {
        from: value.wallet.toLowerCase(),
        to: message.to.toLowerCase(),
        value: amountAtomic,
        validAfter: message.validAfter,
        validBefore: message.validBefore,
        nonce: message.nonce.toLowerCase(),
      },
    },
  };
}

export function normalizePaidResearchExecution(value: unknown): {
  quoteId: string;
  signature: string;
} | null {
  if (
    !isRecord(value) ||
    !isAgentResearchUuid(value.quoteId) ||
    typeof value.signature !== "string" ||
    !SIGNATURE_PATTERN.test(value.signature)
  ) {
    return null;
  }
  return { quoteId: value.quoteId.toLowerCase(), signature: value.signature };
}

export function canonicalPaidResearchReceipt(
  receipt: Omit<PaidResearchReceipt, "receiptHash"> | PaidResearchReceipt
): string {
  return JSON.stringify({
    version: 1,
    id: receipt.id,
    quoteId: receipt.quoteId,
    requestId: receipt.requestId,
    chainId: receipt.chainId,
    wallet: receipt.wallet.toLowerCase(),
    market: receipt.market,
    durationSeconds: receipt.durationSeconds,
    signal: receipt.signal,
    confidence: receipt.confidence,
    rationale: receipt.rationale,
    engine: {
      id: receipt.engine.id,
      version: receipt.engine.version,
      mode: receipt.engine.mode,
      provider: receipt.engine.provider,
      model: receipt.engine.model,
    },
    evidence: {
      source: receipt.evidence.source,
      pair: receipt.evidence.pair,
      interval: receipt.evidence.interval,
      sampleCount: receipt.evidence.sampleCount,
      windowStart: receipt.evidence.windowStart,
      windowEnd: receipt.evidence.windowEnd,
      observedAt: receipt.evidence.observedAt,
      entryPrice: receipt.evidence.entryPrice,
      evidenceHash: receipt.evidence.evidenceHash,
    },
    metrics: {
      horizonReturnBps: receipt.metrics.horizonReturnBps,
      fastTrendBps: receipt.metrics.fastTrendBps,
      volatilityBps: receipt.metrics.volatilityBps,
      rangePositionBps: receipt.metrics.rangePositionBps,
      evidenceScoreBps: receipt.metrics.evidenceScoreBps,
    },
    verification: {
      promptHash: receipt.verification.promptHash,
      responseHash: receipt.verification.responseHash,
      authorizationHash: receipt.verification.authorizationHash,
    },
    spending: {
      currency: receipt.spending.currency,
      decimals: receipt.spending.decimals,
      maxCostAtomic: receipt.spending.maxCostAtomic,
      dailyCostCapAtomic: receipt.spending.dailyCostCapAtomic,
      actualCostAtomic: receipt.spending.actualCostAtomic,
      status: receipt.spending.status,
      scheme: receipt.spending.scheme,
      network: receipt.spending.network,
      asset: receipt.spending.asset,
      payTo: receipt.spending.payTo,
      paymentReference: receipt.spending.paymentReference,
      settlementTransaction: receipt.spending.settlementTransaction,
    },
    providerResponseId: receipt.providerResponseId,
    createdAt: receipt.createdAt,
  });
}

// Phase 2 initially hashed the metrics JSON object in the key order returned by
// PostgREST. PostgreSQL jsonb can reorder those keys. Keep this legacy encoder
// only so the first Mainnet receipts remain verifiable after the stable encoder
// above is deployed.
export function canonicalLegacyPaidResearchReceipt(
  receipt: Omit<PaidResearchReceipt, "receiptHash"> | PaidResearchReceipt
): string {
  return JSON.stringify({
    version: 1,
    id: receipt.id,
    quoteId: receipt.quoteId,
    requestId: receipt.requestId,
    chainId: receipt.chainId,
    wallet: receipt.wallet.toLowerCase(),
    market: receipt.market,
    durationSeconds: receipt.durationSeconds,
    signal: receipt.signal,
    confidence: receipt.confidence,
    rationale: receipt.rationale,
    engine: receipt.engine,
    evidence: receipt.evidence,
    metrics: receipt.metrics,
    verification: receipt.verification,
    spending: receipt.spending,
    providerResponseId: receipt.providerResponseId,
    createdAt: receipt.createdAt,
  });
}

export function parsePaidResearchReceipt(
  value: unknown
): PaidResearchReceipt | null {
  if (!isRecord(value)) return null;
  const chainId = normalizePredarcChainId(value.chainId);
  if (!chainId) return null;
  const config = getPaidResearchConfig(chainId);
  const engine = value.engine;
  const evidence = value.evidence;
  const verification = value.verification;
  const spending = value.spending;
  const metrics = parseMetrics(value.metrics);
  const actualCostAtomic = normalizeAtomic(
    isRecord(spending) ? spending.actualCostAtomic : null,
    PAID_RESEARCH_MAX_CALL_ATOMIC,
    true
  );
  const maxCostAtomic = normalizeAtomic(
    isRecord(spending) ? spending.maxCostAtomic : null,
    PAID_RESEARCH_MAX_CALL_ATOMIC
  );
  const dailyCostCapAtomic = normalizeAtomic(
    isRecord(spending) ? spending.dailyCostCapAtomic : null,
    PAID_RESEARCH_MAX_DAILY_ATOMIC
  );

  if (
    !isAgentResearchUuid(value.id) ||
    !isAgentResearchUuid(value.quoteId) ||
    !isAgentResearchUuid(value.requestId) ||
    typeof value.wallet !== "string" ||
    !ADDRESS_PATTERN.test(value.wallet) ||
    !isMarket(value.market) ||
    !isDuration(value.durationSeconds) ||
    !isSignal(value.signal) ||
    !isWholeNumber(value.confidence) ||
    value.confidence < 50 ||
    value.confidence > 100 ||
    typeof value.rationale !== "string" ||
    value.rationale.length < 20 ||
    value.rationale.length > 500 ||
    !isRecord(engine) ||
    engine.id !== PAID_RESEARCH_ENGINE_ID ||
    engine.version !== PAID_RESEARCH_ENGINE_VERSION ||
    engine.mode !== "paid-ai" ||
    engine.provider !== PAID_RESEARCH_PROVIDER ||
    engine.model !== PAID_RESEARCH_MODEL ||
    !isRecord(evidence) ||
    evidence.source !== "Binance public market data" ||
    evidence.pair !== `${value.market}/USDT` ||
    evidence.interval !== "1m" ||
    !isWholeNumber(evidence.sampleCount) ||
    evidence.sampleCount < 30 ||
    evidence.sampleCount > 120 ||
    !isIsoDate(evidence.windowStart) ||
    !isIsoDate(evidence.windowEnd) ||
    !isIsoDate(evidence.observedAt) ||
    typeof evidence.entryPrice !== "string" ||
    !DECIMAL_PATTERN.test(evidence.entryPrice) ||
    typeof evidence.evidenceHash !== "string" ||
    !HASH_PATTERN.test(evidence.evidenceHash) ||
    !metrics ||
    !isRecord(verification) ||
    typeof verification.promptHash !== "string" ||
    !HASH_PATTERN.test(verification.promptHash) ||
    typeof verification.responseHash !== "string" ||
    !HASH_PATTERN.test(verification.responseHash) ||
    typeof verification.authorizationHash !== "string" ||
    !HASH_PATTERN.test(verification.authorizationHash) ||
    !isRecord(spending) ||
    spending.currency !== "USDC" ||
    spending.decimals !== 6 ||
    maxCostAtomic === null ||
    dailyCostCapAtomic === null ||
    actualCostAtomic === null ||
    BigInt(maxCostAtomic) > BigInt(dailyCostCapAtomic) ||
    BigInt(actualCostAtomic) > BigInt(maxCostAtomic) ||
    (spending.status !== "settled" && spending.status !== "not-charged") ||
    (spending.status === "settled" && actualCostAtomic === "0") ||
    (spending.status === "not-charged" && actualCostAtomic !== "0") ||
    spending.scheme !== "exact" ||
    spending.network !== config.network ||
    String(spending.asset).toLowerCase() !== config.usdc ||
    typeof spending.payTo !== "string" ||
    !ADDRESS_PATTERN.test(spending.payTo) ||
    typeof spending.paymentReference !== "string" ||
    !PAYMENT_REFERENCE_PATTERN.test(spending.paymentReference) ||
    !(
      spending.settlementTransaction === null ||
      (typeof spending.settlementTransaction === "string" &&
        /^0x[0-9a-f]{64}$/i.test(spending.settlementTransaction))
    ) ||
    typeof value.providerResponseId !== "string" ||
    value.providerResponseId.length < 1 ||
    value.providerResponseId.length > 200 ||
    !isIsoDate(value.createdAt) ||
    typeof value.receiptHash !== "string" ||
    !HASH_PATTERN.test(value.receiptHash)
  ) {
    return null;
  }

  return {
    id: value.id,
    quoteId: value.quoteId,
    requestId: value.requestId,
    chainId,
    wallet: value.wallet.toLowerCase(),
    market: value.market,
    durationSeconds: value.durationSeconds,
    signal: value.signal,
    confidence: value.confidence,
    rationale: value.rationale,
    engine: {
      id: PAID_RESEARCH_ENGINE_ID,
      version: PAID_RESEARCH_ENGINE_VERSION,
      mode: "paid-ai",
      provider: PAID_RESEARCH_PROVIDER,
      model: PAID_RESEARCH_MODEL,
    },
    evidence: {
      source: "Binance public market data",
      pair: evidence.pair,
      interval: "1m",
      sampleCount: evidence.sampleCount,
      windowStart: evidence.windowStart,
      windowEnd: evidence.windowEnd,
      observedAt: evidence.observedAt,
      entryPrice: evidence.entryPrice,
      evidenceHash: evidence.evidenceHash,
    },
    metrics,
    verification: {
      promptHash: verification.promptHash,
      responseHash: verification.responseHash,
      authorizationHash: verification.authorizationHash,
    },
    spending: {
      currency: "USDC",
      decimals: 6,
      maxCostAtomic,
      dailyCostCapAtomic,
      actualCostAtomic,
      status: spending.status,
      scheme: "exact",
      network: config.network,
      asset: config.usdc,
      payTo: spending.payTo.toLowerCase(),
      paymentReference: spending.paymentReference.toLowerCase(),
      settlementTransaction:
        typeof spending.settlementTransaction === "string"
          ? spending.settlementTransaction.toLowerCase()
          : null,
    },
    providerResponseId: value.providerResponseId,
    createdAt: value.createdAt,
    receiptHash: value.receiptHash,
  };
}

export function parsePaidResearchExecuteResponse(
  value: unknown
): PaidResearchExecuteResponse | null {
  if (
    !isRecord(value) ||
    typeof value.replayed !== "boolean" ||
    value.verification !== "verified"
  ) {
    return null;
  }
  const receipt = parsePaidResearchReceipt(value.receipt);
  return receipt
    ? { receipt, replayed: value.replayed, verification: "verified" }
    : null;
}
