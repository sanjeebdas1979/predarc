import { defineChain, isAddress, parseAbi, zeroAddress, type Address } from "viem";
import { arcTestnet } from "viem/chains";

export const arcMainnet = defineChain({
  id: 5042,
  name: "Arc",
  nativeCurrency: { name: "USDC", symbol: "USDC", decimals: 18 },
  rpcUrls: { default: { http: ["https://rpc.mainnet.arc.io"] } },
  blockExplorers: { default: { name: "Arc Explorer", url: "https://explorer.arc.io" } },
});

export const dailyChain = process.env.NEXT_PUBLIC_PREDARC_DAILY_NETWORK === "mainnet"
  ? arcMainnet : arcTestnet;
const configuredAddress = process.env.NEXT_PUBLIC_PREDARC_DAILY_ADDRESS;
export const dailyAddress: Address | undefined = configuredAddress &&
  isAddress(configuredAddress) && configuredAddress.toLowerCase() !== zeroAddress
  ? configuredAddress : undefined;
// Separate readiness flag: a deployed contract alone is not a working prediction service.
export const dailyEnabled = process.env.NEXT_PUBLIC_PREDARC_DAILY_ENABLED === "true" && !!dailyAddress;
export const dailyExplorer = dailyChain.id === arcMainnet.id
  ? "https://explorer.arc.io" : "https://explorer.testnet.arc.io";
export const dailyAbi = parseAbi([
  "function activate()",
  "function claim()",
  "function status(address user) view returns (uint256 activationExpiry, uint256 claimReadyAt, uint256 unclaimedPoints, uint256 totalClaimed)",
  "error AlreadyActive(uint256 until)",
  "error ClaimCoolingDown(uint256 until)",
  "error NothingToClaim()",
]);
