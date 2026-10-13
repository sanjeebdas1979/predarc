export const AGENT_RESEARCH_MARKETS = [
  "BTC",
  "ETH",
  "BNB",
  "SOL",
  "XRP",
] as const;

export const AGENT_RESEARCH_DURATIONS = [60, 300, 900, 3600] as const;

export const AGENT_RESEARCH_BUDGETS = [
  "0",
  "5000",
  "10000",
  "50000",
] as const;

export const AGENT_RESEARCH_DAILY_LIMIT = 10;
export const AGENT_RESEARCH_ENGINE_ID = "predarc-market-evidence";
export const AGENT_RESEARCH_ENGINE_VERSION = "1.0.0";

export type AgentResearchMarket = (typeof AGENT_RESEARCH_MARKETS)[number];
export type AgentResearchDuration =
  (typeof AGENT_RESEARCH_DURATIONS)[number];
export type AgentResearchSignal = "higher" | "lower" | "neutral";

export type AgentResearchRequest = {
  requestId: string;
  market: AgentResearchMarket;
  durationSeconds: AgentResearchDuration;
  maxCostAtomic: string;
};

export type AgentResearchCandle = {
  openTime: number;
  closeTime: number;
  open: number;
  high: number;
  low: number;
  close: number;
};

export type AgentResearchMetrics = {
  horizonReturnBps: number;
  fastTrendBps: number;
  volatilityBps: number;
  rangePositionBps: number;
  evidenceScoreBps: number;
};

export type AgentResearchAnalysis = {
  signal: AgentResearchSignal;
  confidence: number;
  rationale: string;
  metrics: AgentResearchMetrics;
};

export type AgentResearchReceipt = {
  id: string;
  requestId: string;
  chainId: number;
  wallet: string;
  market: AgentResearchMarket;
  durationSeconds: AgentResearchDuration;
  signal: AgentResearchSignal;
  confidence: number;
  rationale: string;
  engine: {
    id: typeof AGENT_RESEARCH_ENGINE_ID;
    version: typeof AGENT_RESEARCH_ENGINE_VERSION;
    mode: "deterministic-preview";
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
  spending: {
    currency: "USDC";
    decimals: 6;
    maxCostAtomic: string;
    actualCostAtomic: "0";
    status: "not-charged";
    paymentReference: null;
  };
  createdAt: string;
  receiptHash: string;
};

export type AgentResearchResponse = {
  receipt: AgentResearchReceipt;
  replayed: boolean;
  verification: "verified";
};

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const HASH_PATTERN = /^[0-9a-f]{64}$/;
const WALLET_PATTERN = /^0x[0-9a-f]{40}$/;
const DECIMAL_PATTERN = /^(0|[1-9][0-9]*)(\.[0-9]{1,18})?$/;

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

function normalizeAtomicBudget(value: unknown): string | null {
  const normalized =
    typeof value === "number" && Number.isSafeInteger(value)
      ? String(value)
      : typeof value === "string"
        ? value
        : "";

  if (!/^(0|[1-9][0-9]{0,5})$/.test(normalized)) return null;
  return BigInt(normalized) <= 250_000n ? normalized : null;
}

export function isAgentResearchUuid(value: unknown): value is string {
  return typeof value === "string" && UUID_PATTERN.test(value);
}

export function normalizeAgentResearchRequest(
  value: unknown
): AgentResearchRequest | null {
  if (!isRecord(value)) return null;

  const requestId =
    typeof value.requestId === "string"
      ? value.requestId.toLowerCase()
      : "";
  const maxCostAtomic = normalizeAtomicBudget(value.maxCostAtomic);

  if (
    !isAgentResearchUuid(requestId) ||
    !isMarket(value.market) ||
    !isDuration(value.durationSeconds) ||
    maxCostAtomic === null
  ) {
    return null;
  }

  return {
    requestId,
    market: value.market,
    durationSeconds: value.durationSeconds,
    maxCostAtomic,
  };
}

export function canonicalAgentResearchRequest(input: {
  request: AgentResearchRequest;
  chainId: number;
  wallet: string;
}): string {
  return JSON.stringify({
    version: 1,
    requestId: input.request.requestId,
    chainId: input.chainId,
    wallet: input.wallet.toLowerCase(),
    market: input.request.market,
    durationSeconds: input.request.durationSeconds,
    maxCostAtomic: input.request.maxCostAtomic,
  });
}

function average(values: readonly number[]): number {
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function toBps(numerator: number, denominator: number): number {
  return Math.round(((numerator / denominator) - 1) * 10_000);
}

function signedBps(value: number): string {
  return `${value >= 0 ? "+" : ""}${value} bps`;
}

export function buildAgentResearchAnalysis(
  candles: readonly AgentResearchCandle[],
  durationSeconds: AgentResearchDuration
): AgentResearchAnalysis | null {
  if (candles.length < 30 || !isDuration(durationSeconds)) return null;

  const valid = candles.every(
    (candle, index) =>
      Number.isSafeInteger(candle.openTime) &&
      Number.isSafeInteger(candle.closeTime) &&
      candle.openTime < candle.closeTime &&
      (index === 0 || candle.openTime > candles[index - 1]!.openTime) &&
      [candle.open, candle.high, candle.low, candle.close].every(
        (value) => Number.isFinite(value) && value > 0
      ) &&
      candle.high >= Math.max(candle.open, candle.close) &&
      candle.low <= Math.min(candle.open, candle.close)
  );

  if (!valid) return null;

  const closes = candles.map((candle) => candle.close);
  const last = closes.at(-1)!;
  const horizonSteps = Math.min(
    Math.max(Math.round(durationSeconds / 60), 1),
    candles.length - 1
  );
  const horizonAnchor = closes[closes.length - 1 - horizonSteps]!;
  const fastWindow = closes.slice(-5);
  const slowWindow = closes.slice(-Math.min(30, closes.length));
  const horizonReturnBps = toBps(last, horizonAnchor);
  const fastTrendBps = toBps(average(fastWindow), average(slowWindow));
  const recentCloses = closes.slice(-21);
  const oneMinuteReturns = recentCloses.slice(1).map((close, index) =>
    ((close / recentCloses[index]!) - 1) * 10_000
  );
  const volatilityBps = Math.max(
    1,
    Math.round(
      Math.sqrt(
        average(oneMinuteReturns.map((returnBps) => returnBps ** 2))
      )
    )
  );
  const rangeCandles = candles.slice(-30);
  const rangeLow = Math.min(...rangeCandles.map((candle) => candle.low));
  const rangeHigh = Math.max(...rangeCandles.map((candle) => candle.high));
  const rangePositionBps =
    rangeHigh === rangeLow
      ? 0
      : Math.round(
          ((last - rangeLow) / (rangeHigh - rangeLow) - 0.5) * 10_000
        );
  const evidenceScoreBps = Math.round(
    horizonReturnBps * 0.55 +
      fastTrendBps * 0.35 +
      rangePositionBps * 0.01
  );
  const aligned =
    Math.sign(horizonReturnBps) !== 0 &&
    Math.sign(horizonReturnBps) === Math.sign(fastTrendBps);
  const signalStrength = Math.abs(evidenceScoreBps) / volatilityBps;
  const directionalConfidence = Math.min(
    88,
    52 + Math.round(Math.min(28, signalStrength * 12)) + (aligned ? 5 : 0)
  );
  const isMixed =
    Math.abs(evidenceScoreBps) < Math.max(3, Math.round(volatilityBps * 0.35));
  const signal: AgentResearchSignal = isMixed
    ? "neutral"
    : evidenceScoreBps > 0
      ? "higher"
      : "lower";
  const confidence = signal === "neutral"
    ? Math.min(60, Math.max(50, directionalConfidence))
    : directionalConfidence;
  const lean =
    signal === "neutral"
      ? "The evidence is mixed, so no directional edge is issued."
      : `The combined evidence leans ${signal} for this horizon.`;

  return {
    signal,
    confidence,
    rationale: `Horizon momentum is ${signedBps(
      horizonReturnBps
    )}, the fast trend is ${signedBps(
      fastTrendBps
    )}, and recent one-minute volatility is ${volatilityBps} bps. ${lean}`,
    metrics: {
      horizonReturnBps,
      fastTrendBps,
      volatilityBps,
      rangePositionBps,
      evidenceScoreBps,
    },
  };
}

export function canonicalAgentResearchReceipt(
  receipt: Omit<AgentResearchReceipt, "receiptHash"> | AgentResearchReceipt
): string {
  return JSON.stringify({
    version: 1,
    id: receipt.id,
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
    spending: {
      currency: receipt.spending.currency,
      decimals: receipt.spending.decimals,
      maxCostAtomic: receipt.spending.maxCostAtomic,
      actualCostAtomic: receipt.spending.actualCostAtomic,
      status: receipt.spending.status,
      paymentReference: receipt.spending.paymentReference,
    },
    createdAt: receipt.createdAt,
  });
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

export function parseAgentResearchReceipt(
  value: unknown
): AgentResearchReceipt | null {
  if (!isRecord(value)) return null;
  const engine = value.engine;
  const evidence = value.evidence;
  const spending = value.spending;
  const metrics = parseMetrics(value.metrics);

  if (
    !isAgentResearchUuid(value.id) ||
    !isAgentResearchUuid(value.requestId) ||
    !isWholeNumber(value.chainId) ||
    typeof value.wallet !== "string" ||
    !WALLET_PATTERN.test(value.wallet) ||
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
    engine.id !== AGENT_RESEARCH_ENGINE_ID ||
    engine.version !== AGENT_RESEARCH_ENGINE_VERSION ||
    engine.mode !== "deterministic-preview" ||
    !isRecord(evidence) ||
    evidence.source !== "Binance public market data" ||
    typeof evidence.pair !== "string" ||
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
    !isRecord(spending) ||
    spending.currency !== "USDC" ||
    spending.decimals !== 6 ||
    normalizeAtomicBudget(spending.maxCostAtomic) === null ||
    spending.actualCostAtomic !== "0" ||
    spending.status !== "not-charged" ||
    spending.paymentReference !== null ||
    !isIsoDate(value.createdAt) ||
    typeof value.receiptHash !== "string" ||
    !HASH_PATTERN.test(value.receiptHash)
  ) {
    return null;
  }

  return {
    id: value.id,
    requestId: value.requestId,
    chainId: value.chainId,
    wallet: value.wallet.toLowerCase(),
    market: value.market,
    durationSeconds: value.durationSeconds,
    signal: value.signal,
    confidence: value.confidence,
    rationale: value.rationale,
    engine: {
      id: AGENT_RESEARCH_ENGINE_ID,
      version: AGENT_RESEARCH_ENGINE_VERSION,
      mode: "deterministic-preview",
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
    spending: {
      currency: "USDC",
      decimals: 6,
      maxCostAtomic: String(spending.maxCostAtomic),
      actualCostAtomic: "0",
      status: "not-charged",
      paymentReference: null,
    },
    createdAt: value.createdAt,
    receiptHash: value.receiptHash,
  };
}

export function parseAgentResearchResponse(
  value: unknown
): AgentResearchResponse | null {
  if (
    !isRecord(value) ||
    typeof value.replayed !== "boolean" ||
    value.verification !== "verified"
  ) {
    return null;
  }

  const receipt = parseAgentResearchReceipt(value.receipt);
  return receipt
    ? { receipt, replayed: value.replayed, verification: "verified" }
    : null;
}

export function formatResearchUsdc(atomic: string): string {
  const value = BigInt(atomic);
  const whole = value / 1_000_000n;
  const fraction = (value % 1_000_000n)
    .toString()
    .padStart(6, "0")
    .replace(/0+$/, "");

  return fraction ? `${whole}.${fraction}` : whole.toString();
}
