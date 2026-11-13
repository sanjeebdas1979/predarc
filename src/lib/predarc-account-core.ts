export type NormalizedPredarcAccount = {
  wallet: string;
  balance: string;
  sessionExpiresAt: string | null;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function unwrapAccountResult(value: unknown, depth = 0): unknown {
  if (depth > 3) return null;

  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed.startsWith("{") && !trimmed.startsWith("[")) {
      return value;
    }

    try {
      return unwrapAccountResult(JSON.parse(trimmed), depth + 1);
    } catch {
      return null;
    }
  }

  if (Array.isArray(value)) {
    return value.length === 1
      ? unwrapAccountResult(value[0], depth + 1)
      : null;
  }

  if (isRecord(value)) {
    if ("wallet" in value || "balance" in value) return value;

    for (const key of ["predarc_account_v1", "result"]) {
      if (key in value) {
        return unwrapAccountResult(value[key], depth + 1);
      }
    }
  }

  return value;
}

function normalizeWallet(value: unknown): string | null {
  return typeof value === "string" && /^0x[0-9a-f]{40}$/i.test(value)
    ? value.toLowerCase()
    : null;
}

function normalizeBalance(value: unknown): string | null {
  if (typeof value === "number") {
    return Number.isSafeInteger(value) && value >= 0 ? String(value) : null;
  }

  if (typeof value !== "string") return null;

  const match = value.match(/^(0|[1-9][0-9]*)(?:\.0+)?$/);
  return match?.[1] ?? null;
}

export function normalizePredarcAccountRpc(
  value: unknown,
  expectedWallet: string,
  expectedChainId: number
): NormalizedPredarcAccount | null {
  const unwrapped = unwrapAccountResult(value);
  if (!isRecord(unwrapped)) return null;

  const wallet = normalizeWallet(unwrapped.wallet);
  const normalizedExpectedWallet = normalizeWallet(expectedWallet);
  const balance = normalizeBalance(unwrapped.balance);
  const chainId = unwrapped.chainId ?? unwrapped.chain_id;

  if (
    !wallet ||
    !normalizedExpectedWallet ||
    wallet !== normalizedExpectedWallet ||
    !balance ||
    (chainId !== undefined && Number(chainId) !== expectedChainId)
  ) {
    return null;
  }

  const expiresAt =
    unwrapped.sessionExpiresAt ?? unwrapped.session_expires_at;

  return {
    wallet,
    balance,
    sessionExpiresAt: typeof expiresAt === "string" ? expiresAt : null,
  };
}

export function describeAccountRpcShape(value: unknown) {
  if (Array.isArray(value)) {
    return { kind: "array", length: value.length };
  }

  if (isRecord(value)) {
    return { kind: "object", keys: Object.keys(value).slice(0, 8) };
  }

  return { kind: typeof value };
}
