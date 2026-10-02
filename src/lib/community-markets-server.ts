import "server-only";

import {
  createPublicClient,
  decodeFunctionData,
  http,
  isAddressEqual,
  type Address,
  type Hash,
} from "viem";
import { arcTestnet } from "viem/chains";

import {
  FORECAST_REGISTRY_V2_ABI,
} from "@/app/contracts/forecastRegistryV2";
import type { CommunityMarketAsset } from "@/lib/community-markets-core";
import { arcMainnet } from "@/lib/daily";
import {
  forecastChainId,
  forecastRegistryAddress,
} from "@/lib/forecast-network";

const BINANCE_ENDPOINTS = [
  "https://data-api.binance.vision",
  "https://api.binance.com",
  "https://api-gcp.binance.com",
];

type MarketQuote = {
  price: number;
  observedAt: string;
  source: "binance" | "binance_1m_close";
};

type CommunityForecastVerification = {
  wallet: string;
  transactionHash: `0x${string}`;
  forecastId: bigint;
  direction: 0 | 1;
  durationSeconds: number;
  points: bigint;
  targetPrice: bigint;
};

const forecastChain =
  forecastChainId === arcMainnet.id ? arcMainnet : arcTestnet;

const forecastClient = createPublicClient({
  chain: forecastChain,
  transport: http(forecastChain.rpcUrls.default.http[0], {
    timeout: 10_000,
    retryCount: 0,
  }),
});

export class CommunityMarketPriceNotReadyError extends Error {
  constructor() {
    super("The finalized Binance minute is not ready yet.");
    this.name = "CommunityMarketPriceNotReadyError";
  }
}

export class CommunityForecastVerificationError extends Error {
  constructor(message = "The Arc forecast transaction could not be verified.") {
    super(message);
    this.name = "CommunityForecastVerificationError";
  }
}

export async function verifyCommunityForecastTransaction(
  expected: CommunityForecastVerification
): Promise<void> {
  const hash = expected.transactionHash as Hash;

  try {
    const [transaction, receipt] = await Promise.all([
      forecastClient.getTransaction({ hash }),
      forecastClient.getTransactionReceipt({ hash }),
    ]);

    if (
      receipt.status !== "success" ||
      transaction.chainId !== forecastChainId ||
      !transaction.to ||
      !isAddressEqual(transaction.from, expected.wallet as Address) ||
      !isAddressEqual(transaction.to, forecastRegistryAddress)
    ) {
      throw new CommunityForecastVerificationError();
    }

    const decoded = decodeFunctionData({
      abi: FORECAST_REGISTRY_V2_ABI,
      data: transaction.input,
    });

    if (
      decoded.functionName !== "submitForecast" ||
      !decoded.args ||
      decoded.args.length !== 5
    ) {
      throw new CommunityForecastVerificationError();
    }

    const [forecastId, direction, duration, points, targetPrice] = decoded.args;

    if (
      forecastId !== expected.forecastId ||
      direction !== expected.direction ||
      duration !== expected.durationSeconds ||
      points !== expected.points ||
      targetPrice !== expected.targetPrice
    ) {
      throw new CommunityForecastVerificationError(
        "The Arc transaction does not match this market prediction."
      );
    }
  } catch (error) {
    if (error instanceof CommunityForecastVerificationError) throw error;

    throw new CommunityForecastVerificationError();
  }
}

async function fetchBinanceJson(
  pathname: string,
  searchParams: Record<string, string>
): Promise<unknown> {
  let lastError: Error | null = null;

  for (const baseUrl of BINANCE_ENDPOINTS) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);

    try {
      const url = new URL(pathname, baseUrl);

      for (const [name, value] of Object.entries(searchParams)) {
        url.searchParams.set(name, value);
      }

      const response = await fetch(url, {
        cache: "no-store",
        signal: controller.signal,
        headers: { Accept: "application/json" },
      });

      if (!response.ok) {
        throw new Error(`Binance returned HTTP ${response.status}.`);
      }

      return await response.json();
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

export async function fetchCommunitySpotPrice(
  asset: CommunityMarketAsset
): Promise<MarketQuote> {
  const data = await fetchBinanceJson("/api/v3/ticker/price", {
    symbol: `${asset}USDT`,
  });
  const price =
    typeof data === "object" && data !== null && "price" in data
      ? Number(data.price)
      : Number.NaN;

  if (!Number.isFinite(price) || price <= 0) {
    throw new Error("Binance returned an invalid price.");
  }

  return {
    price,
    observedAt: new Date().toISOString(),
    source: "binance",
  };
}

export async function fetchCommunitySettlementPrice(
  asset: CommunityMarketAsset,
  closesAt: string,
  now = Date.now()
): Promise<MarketQuote> {
  const closesAtMs = Date.parse(closesAt);

  if (!Number.isFinite(closesAtMs) || closesAtMs <= 0) {
    throw new Error("Community market has an invalid close time.");
  }

  const candleStartMs = Math.floor(closesAtMs / 60_000) * 60_000;
  const candleReadyAt = candleStartMs + 60_000 + 2_000;

  if (now < candleReadyAt) {
    throw new CommunityMarketPriceNotReadyError();
  }

  const data = await fetchBinanceJson("/api/v3/klines", {
    symbol: `${asset}USDT`,
    interval: "1m",
    startTime: String(candleStartMs),
    limit: "1",
  });

  if (!Array.isArray(data) || !Array.isArray(data[0])) {
    throw new Error("Binance returned an invalid settlement candle.");
  }

  const candle = data[0] as unknown[];
  const openTime = Number(candle[0]);
  const price = Number(candle[4]);
  const closeTime = Number(candle[6]);

  if (
    openTime !== candleStartMs ||
    !Number.isFinite(price) ||
    price <= 0 ||
    !Number.isFinite(closeTime) ||
    closeTime < closesAtMs ||
    closeTime > closesAtMs + 60_000
  ) {
    throw new Error("Binance settlement candle did not match the market expiry.");
  }

  return {
    price,
    observedAt: new Date(closeTime).toISOString(),
    source: "binance_1m_close",
  };
}
