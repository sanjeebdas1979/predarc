import { defineChain, parseAbi } from "viem";

import {
  ARC_MAINNET_CHAIN_ID,
  getDailyAddress,
  type PredarcChainId,
} from "@/lib/predarc-networks";

export const arcMainnet = defineChain({
  id: ARC_MAINNET_CHAIN_ID,
  name: "Arc",
  nativeCurrency: { name: "USDC", symbol: "USDC", decimals: 18 },
  rpcUrls: { default: { http: ["https://rpc.mainnet.arc.io"] } },
  blockExplorers: { default: { name: "Arc Explorer", url: "https://explorer.arc.io" } },
});

export function dailyEnabled(chainId: PredarcChainId): boolean {
  const enabled =
    chainId === ARC_MAINNET_CHAIN_ID
      ? process.env.NEXT_PUBLIC_PREDARC_DAILY_ENABLED === "true"
      : process.env.NEXT_PUBLIC_PREDARC_BASE_DAILY_ENABLED === "true";
  return enabled && Boolean(getDailyAddress(chainId));
}
export const dailyAbi = parseAbi([
  "function activate()",
  "function claim()",
  "function status(address user) view returns (uint256 activationExpiry, uint256 claimReadyAt, uint256 unclaimedPoints, uint256 totalClaimed)",
  "error AlreadyActive(uint256 until)",
  "error ClaimCoolingDown(uint256 until)",
  "error NothingToClaim()",
]);
