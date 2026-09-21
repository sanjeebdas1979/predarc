import { zeroAddress, isAddress } from "viem";

export const RECEIPT_CHAIN_ID = 5042002;
export const RECEIPT_EXPLORER = "https://explorer.testnet.arc.io";
export const HASH_PATTERN = /^0x[0-9a-fA-F]{64}$/;

export function validRecipient(value: string): boolean {
  return isAddress(value) && value.toLowerCase() !== zeroAddress;
}

export { paymentValue, isDirectPayment } from "./receipts-core";
