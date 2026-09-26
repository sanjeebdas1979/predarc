import { arcTestnet } from "viem/chains";
import { arcMainnet } from "@/lib/daily";
import {
  FORECAST_REGISTRY_MAINNET_ADDRESS,
  FORECAST_REGISTRY_TESTNET_ADDRESS,
} from "@/app/contracts/forecastRegistryV2";

export const forecastNetwork =
  process.env.NEXT_PUBLIC_PREDARC_FORECAST_NETWORK === "mainnet"
    ? "mainnet"
    : "testnet";

export const forecastChainId =
  forecastNetwork === "mainnet"
    ? arcMainnet.id
    : arcTestnet.id;

export const forecastRegistryAddress =
  forecastNetwork === "mainnet"
    ? FORECAST_REGISTRY_MAINNET_ADDRESS
    : FORECAST_REGISTRY_TESTNET_ADDRESS;

export const forecastNetworkLabel =
  forecastNetwork === "mainnet"
    ? "Arc Mainnet"
    : "Arc Testnet";
