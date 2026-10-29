import { isAddress, zeroAddress, type Address } from "viem";
import { base } from "viem/chains";

export const ARC_MAINNET_CHAIN_ID = 5042 as const;
export const BASE_MAINNET_CHAIN_ID = base.id;
export const ARC_FORECAST_REGISTRY_ADDRESS =
  "0x92A7a9F8ee4537414ACb3d2Bb35E5976B8F48Df9" as const;

export type PredarcChainId =
  | typeof ARC_MAINNET_CHAIN_ID
  | typeof BASE_MAINNET_CHAIN_ID;

export type PredarcNetwork = {
  chainId: PredarcChainId;
  key: "arc" | "base";
  label: "Arc Mainnet" | "Base Mainnet";
  shortLabel: "Arc" | "Base";
  circleChain: "Arc" | "Base";
  explorerUrl: string;
  rpcUrl: string;
  nativeCurrency: "USDC" | "ETH";
  usdcAddress: Address;
  blockRunEndpoint: string;
  blockRunNetwork: `eip155:${PredarcChainId}`;
};

export const PREDARC_CHAIN_IDS = [
  ARC_MAINNET_CHAIN_ID,
  BASE_MAINNET_CHAIN_ID,
] as const;

export const DEFAULT_PREDARC_CHAIN_ID = ARC_MAINNET_CHAIN_ID;

export const PREDARC_NETWORKS: Record<PredarcChainId, PredarcNetwork> = {
  [ARC_MAINNET_CHAIN_ID]: {
    chainId: ARC_MAINNET_CHAIN_ID,
    key: "arc",
    label: "Arc Mainnet",
    shortLabel: "Arc",
    circleChain: "Arc",
    explorerUrl: "https://explorer.arc.io",
    rpcUrl: "https://rpc.mainnet.arc.io",
    nativeCurrency: "USDC",
    usdcAddress: "0x3600000000000000000000000000000000000000",
    blockRunEndpoint: "https://arc.blockrun.ai/api/v1/chat/completions",
    blockRunNetwork: "eip155:5042",
  },
  [BASE_MAINNET_CHAIN_ID]: {
    chainId: BASE_MAINNET_CHAIN_ID,
    key: "base",
    label: "Base Mainnet",
    shortLabel: "Base",
    circleChain: "Base",
    explorerUrl: "https://basescan.org",
    rpcUrl: "https://mainnet.base.org",
    nativeCurrency: "ETH",
    usdcAddress: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
    blockRunEndpoint: "https://blockrun.ai/api/v1/chat/completions",
    blockRunNetwork: "eip155:8453",
  },
};

function configuredAddress(value: string | undefined): Address | undefined {
  return value &&
    isAddress(value) &&
    value.toLowerCase() !== zeroAddress
    ? value
    : undefined;
}

const baseForecastRegistryAddress = configuredAddress(
  process.env.NEXT_PUBLIC_PREDARC_BASE_FORECAST_REGISTRY_ADDRESS
);

const arcDailyAddress = configuredAddress(
  process.env.NEXT_PUBLIC_PREDARC_DAILY_ADDRESS
);

const baseDailyAddress = configuredAddress(
  process.env.NEXT_PUBLIC_PREDARC_BASE_DAILY_ADDRESS
);

export function isPredarcChainId(value: unknown): value is PredarcChainId {
  return value === ARC_MAINNET_CHAIN_ID || value === BASE_MAINNET_CHAIN_ID;
}

export function normalizePredarcChainId(value: unknown): PredarcChainId | null {
  const numeric = typeof value === "string" ? Number(value) : value;
  return isPredarcChainId(numeric) ? numeric : null;
}

export function getPredarcNetwork(chainId: PredarcChainId): PredarcNetwork {
  return PREDARC_NETWORKS[chainId];
}

export function getForecastRegistryAddress(
  chainId: PredarcChainId
): Address | undefined {
  return chainId === ARC_MAINNET_CHAIN_ID
    ? ARC_FORECAST_REGISTRY_ADDRESS
    : baseForecastRegistryAddress;
}

export function getDailyAddress(chainId: PredarcChainId): Address | undefined {
  return chainId === ARC_MAINNET_CHAIN_ID
    ? arcDailyAddress
    : baseDailyAddress;
}

export function isForecastRegistryReady(chainId: PredarcChainId): boolean {
  return Boolean(getForecastRegistryAddress(chainId));
}

export function transactionUrl(chainId: PredarcChainId, hash: string): string {
  return `${getPredarcNetwork(chainId).explorerUrl}/tx/${hash}`;
}
