export const AGENT_AUTOMATION_MARKETS = [
  "BTC",
  "ETH",
  "BNB",
  "SOL",
  "XRP",
] as const;

export const AGENT_AUTOMATION_DURATIONS = [
  60,
  300,
  900,
  3600,
] as const;

export type AgentAutomationMarket =
  (typeof AGENT_AUTOMATION_MARKETS)[number];

export type AgentAutomationDuration =
  (typeof AGENT_AUTOMATION_DURATIONS)[number];

export type AgentAutomationDirection = "higher" | "lower";

export type AgentAutomationPolicy = {
  name: string;
  allowedMarkets: AgentAutomationMarket[];
  allowedDurations: AgentAutomationDuration[];
  maxPointsPerPrediction: number;
  maxDailyPoints: number;
  maxDailyPredictions: number;
  minimumConfidence: number;
  expiresAt: string;
};

export type AgentConnectionStatus =
  | "active"
  | "paused"
  | "revoked"
  | "expired";

export type AgentConnection = AgentAutomationPolicy & {
  id: string;
  status: AgentConnectionStatus;
  dailyPointsUsed: string;
  dailyPredictionsUsed: number;
  totalPredictions: string;
  lastUsedAt: string | null;
  createdAt: string;
};

export type AgentPredictionInput = {
  requestId: string;
  market: AgentAutomationMarket;
  direction: AgentAutomationDirection;
  points: number;
  durationSeconds: AgentAutomationDuration;
  confidence: number;
  rationale: string;
};

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const WALLET_PATTERN = /^0x[0-9a-f]{40}$/i;
const SIGNATURE_PATTERN = /^0x[0-9a-f]{130}$/i;
const INTEGER_STRING_PATTERN = /^(0|[1-9][0-9]*)$/;

function uniqueSorted<T extends string | number>(values: T[]): T[] {
  return [...new Set(values)].sort((left, right) =>
    typeof left === "number" && typeof right === "number"
      ? left - right
      : String(left).localeCompare(String(right))
  );
}

function isIntegerInRange(
  value: unknown,
  minimum: number,
  maximum: number
): value is number {
  return (
    typeof value === "number" &&
    Number.isSafeInteger(value) &&
    value >= minimum &&
    value <= maximum
  );
}

export function isAgentAutomationMarket(
  value: unknown
): value is AgentAutomationMarket {
  return (
    typeof value === "string" &&
    AGENT_AUTOMATION_MARKETS.includes(value as AgentAutomationMarket)
  );
}

export function isAgentAutomationDuration(
  value: unknown
): value is AgentAutomationDuration {
  return (
    typeof value === "number" &&
    AGENT_AUTOMATION_DURATIONS.includes(value as AgentAutomationDuration)
  );
}

export function isAgentAutomationSignature(
  value: unknown
): value is `0x${string}` {
  return typeof value === "string" && SIGNATURE_PATTERN.test(value);
}

export function isAgentAutomationUuid(value: unknown): value is string {
  return typeof value === "string" && UUID_PATTERN.test(value);
}

export function normalizeAgentAutomationPolicy(
  value: unknown,
  now = Date.now()
): AgentAutomationPolicy | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  const candidate = value as Record<string, unknown>;
  const name = typeof candidate.name === "string" ? candidate.name.trim() : "";
  const rawMarkets = Array.isArray(candidate.allowedMarkets)
    ? candidate.allowedMarkets
    : [];
  const rawDurations = Array.isArray(candidate.allowedDurations)
    ? candidate.allowedDurations
    : [];
  const allowedMarkets = rawMarkets.filter(isAgentAutomationMarket);
  const allowedDurations = rawDurations.filter(isAgentAutomationDuration);
  const expiresAt =
    typeof candidate.expiresAt === "string" ? candidate.expiresAt : "";
  const expiry = Date.parse(expiresAt);

  if (
    name.length < 2 ||
    name.length > 40 ||
    /[\u0000-\u001f\u007f]/.test(name) ||
    allowedMarkets.length !== rawMarkets.length ||
    allowedMarkets.length === 0 ||
    allowedDurations.length !== rawDurations.length ||
    allowedDurations.length === 0 ||
    !isIntegerInRange(candidate.maxPointsPerPrediction, 10, 1_000_000) ||
    !isIntegerInRange(candidate.maxDailyPoints, 10, 10_000_000) ||
    candidate.maxDailyPoints < candidate.maxPointsPerPrediction ||
    !isIntegerInRange(candidate.maxDailyPredictions, 1, 100) ||
    !isIntegerInRange(candidate.minimumConfidence, 50, 100) ||
    !Number.isFinite(expiry) ||
    expiry < now + 5 * 60_000 ||
    expiry > now + 30 * 24 * 60 * 60_000
  ) {
    return null;
  }

  return {
    name,
    allowedMarkets: uniqueSorted(allowedMarkets),
    allowedDurations: uniqueSorted(allowedDurations),
    maxPointsPerPrediction: candidate.maxPointsPerPrediction,
    maxDailyPoints: candidate.maxDailyPoints,
    maxDailyPredictions: candidate.maxDailyPredictions,
    minimumConfidence: candidate.minimumConfidence,
    expiresAt: new Date(expiry).toISOString(),
  };
}

export function canonicalAgentPolicy(policy: AgentAutomationPolicy): string {
  return JSON.stringify({
    name: policy.name,
    allowedMarkets: uniqueSorted(policy.allowedMarkets),
    allowedDurations: uniqueSorted(policy.allowedDurations),
    maxPointsPerPrediction: policy.maxPointsPerPrediction,
    maxDailyPoints: policy.maxDailyPoints,
    maxDailyPredictions: policy.maxDailyPredictions,
    minimumConfidence: policy.minimumConfidence,
    expiresAt: policy.expiresAt,
  });
}

export function buildAgentAuthorizationTypedData(input: {
  wallet: string;
  chainId: number;
  challengeId: string;
  nonce: string;
  policy: AgentAutomationPolicy;
}) {
  if (!WALLET_PATTERN.test(input.wallet)) {
    throw new Error("Invalid automation wallet.");
  }

  if (!isAgentAutomationUuid(input.challengeId)) {
    throw new Error("Invalid automation challenge.");
  }

  if (!/^[0-9a-f]{64}$/.test(input.nonce)) {
    throw new Error("Invalid automation nonce.");
  }

  return {
    domain: {
      name: "Predarc Agent Automation",
      version: "1",
      chainId: input.chainId,
    },
    types: {
      AgentAuthorization: [
        { name: "wallet", type: "address" },
        { name: "challengeId", type: "string" },
        { name: "nonce", type: "string" },
        { name: "agentName", type: "string" },
        { name: "markets", type: "string" },
        { name: "durations", type: "string" },
        { name: "maxPointsPerPrediction", type: "uint256" },
        { name: "maxDailyPoints", type: "uint256" },
        { name: "maxDailyPredictions", type: "uint32" },
        { name: "minimumConfidence", type: "uint8" },
        { name: "expiresAt", type: "uint64" },
      ],
    } as const,
    primaryType: "AgentAuthorization" as const,
    message: {
      wallet: input.wallet.toLowerCase() as `0x${string}`,
      challengeId: input.challengeId,
      nonce: input.nonce,
      agentName: input.policy.name,
      markets: input.policy.allowedMarkets.join(","),
      durations: input.policy.allowedDurations.join(","),
      maxPointsPerPrediction: BigInt(input.policy.maxPointsPerPrediction),
      maxDailyPoints: BigInt(input.policy.maxDailyPoints),
      maxDailyPredictions: input.policy.maxDailyPredictions,
      minimumConfidence: input.policy.minimumConfidence,
      expiresAt: BigInt(Math.floor(Date.parse(input.policy.expiresAt) / 1000)),
    },
  };
}

export function normalizeAgentPredictionInput(
  value: unknown
): AgentPredictionInput | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;

  const candidate = value as Record<string, unknown>;
  const rationale =
    typeof candidate.rationale === "string" ? candidate.rationale.trim() : "";

  if (
    !isAgentAutomationUuid(candidate.requestId) ||
    !isAgentAutomationMarket(candidate.market) ||
    (candidate.direction !== "higher" && candidate.direction !== "lower") ||
    !isIntegerInRange(candidate.points, 10, 1_000_000) ||
    !isAgentAutomationDuration(candidate.durationSeconds) ||
    !isIntegerInRange(candidate.confidence, 0, 100) ||
    rationale.length > 500 ||
    /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(rationale)
  ) {
    return null;
  }

  return {
    requestId: candidate.requestId,
    market: candidate.market,
    direction: candidate.direction,
    points: candidate.points,
    durationSeconds: candidate.durationSeconds,
    confidence: candidate.confidence,
    rationale,
  };
}

export function parseAgentConnectionsResponse(
  value: unknown
): AgentConnection[] | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;

  const connections = (value as Record<string, unknown>).connections;

  if (!Array.isArray(connections)) return null;

  const parsed: AgentConnection[] = [];

  for (const entry of connections) {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) return null;

    const item = entry as Record<string, unknown>;
    const responseExpiry =
      typeof item.expiresAt === "string" ? Date.parse(item.expiresAt) : NaN;
    const policy = normalizeAgentAutomationPolicy(
      {
        name: item.name,
        allowedMarkets: item.allowedMarkets,
        allowedDurations: item.allowedDurations,
        maxPointsPerPrediction: item.maxPointsPerPrediction,
        maxDailyPoints: item.maxDailyPoints,
        maxDailyPredictions: item.maxDailyPredictions,
        minimumConfidence: item.minimumConfidence,
        expiresAt: item.expiresAt,
      },
      Number.isFinite(responseExpiry) ? responseExpiry - 5 * 60_000 : 0
    );

    if (
      !policy ||
      !isAgentAutomationUuid(item.id) ||
      !["active", "paused", "revoked", "expired"].includes(
        String(item.status)
      ) ||
      typeof item.dailyPointsUsed !== "string" ||
      !INTEGER_STRING_PATTERN.test(item.dailyPointsUsed) ||
      !isIntegerInRange(item.dailyPredictionsUsed, 0, 100) ||
      typeof item.totalPredictions !== "string" ||
      !INTEGER_STRING_PATTERN.test(item.totalPredictions) ||
      (item.lastUsedAt !== null &&
        (typeof item.lastUsedAt !== "string" ||
          !Number.isFinite(Date.parse(item.lastUsedAt)))) ||
      typeof item.createdAt !== "string" ||
      !Number.isFinite(Date.parse(item.createdAt))
    ) {
      return null;
    }

    parsed.push({
      ...policy,
      id: item.id,
      status: item.status as AgentConnectionStatus,
      dailyPointsUsed: item.dailyPointsUsed,
      dailyPredictionsUsed: item.dailyPredictionsUsed,
      totalPredictions: item.totalPredictions,
      lastUsedAt: item.lastUsedAt as string | null,
      createdAt: item.createdAt,
    });
  }

  return parsed;
}
