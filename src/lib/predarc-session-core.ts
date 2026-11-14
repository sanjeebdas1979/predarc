export type PredarcSession = {
  wallet: string;
  chainId: number;
  expiresAt: string;
};

export type PredarcAccount = {
  wallet: string;
  balance: string;
};

function isRecord(
  value: unknown
): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export function normalizeWallet(
  value: unknown
): string | null {
  if (
    typeof value !== "string" ||
    !/^0x[0-9a-f]{40}$/i.test(value)
  ) {
    return null;
  }

  return value.toLowerCase();
}

function normalizeUnsignedInteger(
  value: unknown
): string | null {
  if (typeof value === "number") {
    return Number.isSafeInteger(value) && value >= 0
      ? String(value)
      : null;
  }

  if (typeof value !== "string") return null;

  const match = value.match(/^(0|[1-9][0-9]*)(?:\.0+)?$/);
  return match?.[1] ?? null;
}

function normalizeChainId(value: unknown): number | null {
  const numeric =
    typeof value === "string" && /^[0-9]+$/.test(value)
      ? Number(value)
      : value;

  return typeof numeric === "number" &&
    Number.isSafeInteger(numeric) &&
    numeric > 0
    ? numeric
    : null;
}

export function parsePredarcSession(
  value: unknown,
  expectedChainId: number,
  now = Date.now()
): PredarcSession | null {
  if (!isRecord(value) || value.authenticated !== true) {
    return null;
  }

  const wallet = normalizeWallet(value.wallet);
  const expiresAt =
    typeof value.expiresAt === "string"
      ? value.expiresAt
      : "";

  if (
    !wallet ||
    value.chainId !== expectedChainId ||
    !(Date.parse(expiresAt) > now)
  ) {
    return null;
  }

  return {
    wallet,
    chainId: expectedChainId,
    expiresAt,
  };
}

export function parsePredarcAccount(
  value: unknown,
  session: PredarcSession
): PredarcAccount | null {
  if (!isRecord(value) || value.authenticated !== true) {
    return null;
  }

  const wallet = normalizeWallet(value.wallet);
  const chainId = normalizeChainId(value.chainId);
  const balance = normalizeUnsignedInteger(
    value.balance ?? value.points
  );

  if (
    wallet !== session.wallet ||
    chainId !== session.chainId ||
    !balance ||
    !/^(0|[1-9][0-9]*)$/.test(balance)
  ) {
    return null;
  }

  return { wallet, balance };
}

export function sessionMatchesWallet(
  session: PredarcSession | null,
  address: string | undefined
): boolean {
  return Boolean(
    session &&
      normalizeWallet(address) === session.wallet
  );
}

export function pointsAsSafeNumber(
  balance: string | null
): number {
  if (!balance || !/^(0|[1-9][0-9]*)$/.test(balance)) {
    return 0;
  }

  const value = BigInt(balance);
  const maximum = BigInt(Number.MAX_SAFE_INTEGER);

  return Number(value > maximum ? maximum : value);
}
