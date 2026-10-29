import { zeroAddress, isAddress, parseAbi } from "viem";

import {
  ARC_MAINNET_CHAIN_ID,
  BASE_MAINNET_CHAIN_ID,
  getPredarcNetwork,
  type PredarcChainId,
} from "@/lib/predarc-networks";

export const RECEIPT_CHAIN_ID = ARC_MAINNET_CHAIN_ID;
export const RECEIPT_EXPLORER = getPredarcNetwork(
  ARC_MAINNET_CHAIN_ID
).explorerUrl;
export const HASH_PATTERN = /^0x[0-9a-fA-F]{64}$/;

export const receiptUsdcAbi = parseAbi([
  "function transfer(address to, uint256 value) returns (bool)",
  "event Transfer(address indexed from, address indexed to, uint256 value)",
]);

export function receiptUsdcDecimals(chainId: PredarcChainId): 6 | 18 {
  return chainId === BASE_MAINNET_CHAIN_ID ? 6 : 18;
}

export function validRecipient(value: string): boolean {
  return isAddress(value) && value.toLowerCase() !== zeroAddress;
}

export { paymentValue, isDirectPayment } from "./receipts-core";
