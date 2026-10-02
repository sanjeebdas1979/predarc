export const COMMUNITY_MARKET_ASSETS = [
  "BTC",
  "ETH",
  "BNB",
  "SOL",
  "XRP",
] as const;

export const COMMUNITY_MARKET_DURATIONS = [
  300,
  900,
  3600,
] as const;

export type CommunityMarketAsset =
  (typeof COMMUNITY_MARKET_ASSETS)[number];

export type CommunityMarketDuration =
  (typeof COMMUNITY_MARKET_DURATIONS)[number];

export type CommunityMarketDirection =
  | "higher"
  | "lower";

export type CommunityMarketOutcome =
  | CommunityMarketDirection
  | "void"
  | null;

export type CommunityMarketStatus =
  | "open"
  | "awaiting-settlement"
  | "settled";

export type CommunityMarketPrediction = {
  id: string;
  direction: CommunityMarketDirection;
  points: string;
  status: "pending" | "won" | "lost" | "void";
  claimed: boolean;
  canClaim: boolean;
  transactionHash: string;
  onchainForecastId: string;
};

export type CommunityMarket = {
  id: string;
  asset: CommunityMarketAsset;
  creatorWallet: string;
  targetPrice: string;
  referencePrice: string;
  durationSeconds: CommunityMarketDuration;
  createdAt: string;
  closesAt: string;
  resolutionAt: string;
  status: CommunityMarketStatus;
  outcome: CommunityMarketOutcome;
  settlementPrice: string | null;
  settledAt: string | null;
  participantCount: number;
  higherPoints: string;
  lowerPoints: string;
  userPrediction: CommunityMarketPrediction | null;
};

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const WALLET_PATTERN =
  /^0x[0-9a-f]{40}$/i;

const TRANSACTION_HASH_PATTERN =
  /^0x[0-9a-f]{64}$/i;

const SIGNATURE_PATTERN =
  /^0x[0-9a-f]{130}$/i;

const FORECAST_ID_PATTERN =
  /^(0|[1-9][0-9]{0,77})$/;

const INTEGER_STRING_PATTERN =
  /^(0|[1-9][0-9]*)$/;

const PRICE_PATTERN =
  /^(?:0|[1-9][0-9]{0,12})(?:\.[0-9]{1,12})?$/;

export function isCommunityMarketAsset(
  value: unknown
): value is CommunityMarketAsset {
  return (
    typeof value === "string" &&
    COMMUNITY_MARKET_ASSETS.includes(
      value as CommunityMarketAsset
    )
  );
}

export function isCommunityMarketDuration(
  value: unknown
): value is CommunityMarketDuration {
  return (
    typeof value === "number" &&
    Number.isInteger(value) &&
    COMMUNITY_MARKET_DURATIONS.includes(
      value as CommunityMarketDuration
    )
  );
}

export function isCommunityMarketDirection(
  value: unknown
): value is CommunityMarketDirection {
  return value === "higher" || value === "lower";
}

export function isCommunityMarketUuid(
  value: unknown
): value is string {
  return typeof value === "string" && UUID_PATTERN.test(value);
}

export function isCommunityTransactionHash(
  value: unknown
): value is `0x${string}` {
  return (
    typeof value === "string" &&
    TRANSACTION_HASH_PATTERN.test(value)
  );
}

export function isCommunitySignature(
  value: unknown
): value is `0x${string}` {
  return typeof value === "string" && SIGNATURE_PATTERN.test(value);
}

export function isCommunityForecastId(
  value: unknown
): value is string {
  return typeof value === "string" && FORECAST_ID_PATTERN.test(value);
}

export function normalizeCommunityPrice(
  value: unknown
): string | null {
  if (typeof value !== "string") return null;

  const trimmed = value.trim();

  if (!PRICE_PATTERN.test(trimmed)) return null;

  const [wholePart, fractionPart = ""] = trimmed.split(".");
  const normalizedWhole = BigInt(wholePart).toString();
  const normalizedFraction = fractionPart.replace(/0+$/, "");
  const normalized = normalizedFraction
    ? `${normalizedWhole}.${normalizedFraction}`
    : normalizedWhole;
  const numeric = Number(normalized);

  if (
    !Number.isFinite(numeric) ||
    numeric <= 0 ||
    numeric > 1_000_000_000_000
  ) {
    return null;
  }

  return normalized;
}

export function communityPriceToScaledBigInt(
  value: string,
  decimals = 6
): bigint | null {
  const normalized = normalizeCommunityPrice(value);

  if (!normalized || decimals < 0 || decimals > 18) return null;

  const [wholePart, fractionPart = ""] = normalized.split(".");
  const keptFraction = fractionPart.slice(0, decimals).padEnd(decimals, "0");
  const nextDigit = fractionPart.at(decimals) ?? "0";
  const scale = 10n ** BigInt(decimals);
  let scaled = BigInt(wholePart) * scale + BigInt(keptFraction || "0");

  if (nextDigit >= "5") scaled += 1n;

  return scaled > 0n ? scaled : null;
}

export function communityForecastIdFromRequestId(
  requestId: string
): bigint | null {
  if (!isCommunityMarketUuid(requestId)) return null;

  return BigInt(`0x${requestId.replaceAll("-", "")}`);
}

export function communityMarketResolutionTimestamp(
  closesAt: string | number
): number | null {
  const timestamp =
    typeof closesAt === "number" ? closesAt : Date.parse(closesAt);

  if (!Number.isFinite(timestamp) || timestamp <= 0) return null;

  const minuteStart = Math.floor(timestamp / 60_000) * 60_000;

  return minuteStart + 60_000 + 2_000;
}

export function communityMarketDurationLabel(
  seconds: CommunityMarketDuration
): string {
  if (seconds === 300) return "5 minutes";
  if (seconds === 900) return "15 minutes";
  return "1 hour";
}

export function communityMarketQuestion(
  asset: CommunityMarketAsset,
  targetPrice: string
): string {
  return `Will ${asset} close above ${targetPrice} USDT?`;
}

export function buildCommunityMarketCreationMessage(input: {
  requestId: string;
  wallet: string;
  chainId: number;
  asset: CommunityMarketAsset;
  targetPrice: string;
  durationSeconds: CommunityMarketDuration;
}): string {
  return [
    "Predarc Community Market",
    "",
    `Asset: ${input.asset}`,
    `Target: ${input.targetPrice} USDT`,
    `Duration: ${input.durationSeconds} seconds`,
    `Request ID: ${input.requestId}`,
    `Wallet: ${input.wallet.toLowerCase()}`,
    `Chain ID: ${input.chainId}`,
    "",
    "This signature creates the market. It has no gas fee or token approval.",
  ].join("\n");
}

export function communityTargetIsReasonable(
  targetPrice: string,
  referencePrice: number
): boolean {
  const normalizedTarget = normalizeCommunityPrice(targetPrice);

  if (!normalizedTarget) return false;

  const target = Number(normalizedTarget);

  return (
    Number.isFinite(referencePrice) &&
    referencePrice > 0 &&
    Number.isFinite(target) &&
    target >= referencePrice * 0.5 &&
    target <= referencePrice * 1.5
  );
}

function readString(
  value: unknown
): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function readIntegerString(
  value: unknown
): string | null {
  if (typeof value === "number" && Number.isSafeInteger(value) && value >= 0) {
    return String(value);
  }

  return typeof value === "string" && INTEGER_STRING_PATTERN.test(value)
    ? value
    : null;
}

function readPrediction(
  value: unknown
): CommunityMarketPrediction | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return null;
  }

  const row = value as Record<string, unknown>;
  const id = readString(row.id);
  const points = readIntegerString(row.points);
  const transactionHash = readString(row.transactionHash);
  const onchainForecastId = readString(row.onchainForecastId);
  const status = row.status;

  if (
    !id ||
    !isCommunityMarketDirection(row.direction) ||
    !points ||
    !transactionHash ||
    !isCommunityTransactionHash(transactionHash) ||
    !onchainForecastId ||
    !isCommunityForecastId(onchainForecastId) ||
    (status !== "pending" &&
      status !== "won" &&
      status !== "lost" &&
      status !== "void")
  ) {
    return null;
  }

  return {
    id,
    direction: row.direction,
    points,
    status,
    claimed: row.claimed === true,
    canClaim: row.canClaim === true,
    transactionHash,
    onchainForecastId,
  };
}

export function parseCommunityMarketsResponse(
  value: unknown
): CommunityMarket[] | null {
  if (
    typeof value !== "object" ||
    value === null ||
    Array.isArray(value) ||
    !("markets" in value) ||
    !Array.isArray(value.markets)
  ) {
    return null;
  }

  const parsed: CommunityMarket[] = [];

  for (const item of value.markets) {
    if (typeof item !== "object" || item === null || Array.isArray(item)) {
      return null;
    }

    const row = item as Record<string, unknown>;
    const id = readString(row.id);
    const creatorWallet = readString(row.creatorWallet);
    const targetPrice = normalizeCommunityPrice(row.targetPrice);
    const referencePrice = normalizeCommunityPrice(row.referencePrice);
    const createdAt = readString(row.createdAt);
    const closesAt = readString(row.closesAt);
    const resolutionAt = readString(row.resolutionAt);
    const higherPoints = readIntegerString(row.higherPoints);
    const lowerPoints = readIntegerString(row.lowerPoints);
    const participantCount = row.participantCount;
    const status = row.status;
    const outcome = row.outcome;
    const settlementPrice =
      row.settlementPrice === null
        ? null
        : normalizeCommunityPrice(row.settlementPrice);
    const settledAt = row.settledAt === null ? null : readString(row.settledAt);

    if (
      !id ||
      !isCommunityMarketUuid(id) ||
      !isCommunityMarketAsset(row.asset) ||
      !creatorWallet ||
      !WALLET_PATTERN.test(creatorWallet) ||
      !targetPrice ||
      !referencePrice ||
      !isCommunityMarketDuration(row.durationSeconds) ||
      !createdAt ||
      !closesAt ||
      !resolutionAt ||
      !Number.isFinite(Date.parse(createdAt)) ||
      !Number.isFinite(Date.parse(closesAt)) ||
      !Number.isFinite(Date.parse(resolutionAt)) ||
      (status !== "open" &&
        status !== "awaiting-settlement" &&
        status !== "settled") ||
      (outcome !== null &&
        outcome !== "higher" &&
        outcome !== "lower" &&
        outcome !== "void") ||
      (row.settlementPrice !== null && !settlementPrice) ||
      (row.settledAt !== null && !settledAt) ||
      typeof participantCount !== "number" ||
      !Number.isSafeInteger(participantCount) ||
      participantCount < 0 ||
      !higherPoints ||
      !lowerPoints
    ) {
      return null;
    }

    const userPrediction =
      row.userPrediction === null ? null : readPrediction(row.userPrediction);

    if (row.userPrediction !== null && !userPrediction) return null;

    parsed.push({
      id,
      asset: row.asset,
      creatorWallet: creatorWallet.toLowerCase(),
      targetPrice,
      referencePrice,
      durationSeconds: row.durationSeconds,
      createdAt,
      closesAt,
      resolutionAt,
      status,
      outcome,
      settlementPrice,
      settledAt,
      participantCount,
      higherPoints,
      lowerPoints,
      userPrediction,
    });
  }

  return parsed;
}
