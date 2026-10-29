const zeroAddress = "0x0000000000000000000000000000000000000000";

export function paymentValue(amount: string, decimals = 18): bigint {
  if (decimals !== 6 && decimals !== 18) {
    throw new Error("Unsupported USDC decimals.");
  }
  if (!/^(0|[1-9][0-9]*)(\.[0-9]{1,6})?$/.test(amount)) {
    throw new Error("Enter a positive amount with up to 6 decimal places.");
  }
  const [whole, fraction = ""] = amount.split(".");
  const value =
    BigInt(whole) * 10n ** BigInt(decimals) +
    BigInt(fraction.padEnd(decimals, "0"));
  if (value <= 0n || value > 10n * 10n ** BigInt(decimals)) {
    throw new Error("Send more than 0 and at most 10 USDC.");
  }
  return value;
}

export function isDirectPayment(tx: { to: string | null; value: bigint; input: string }, status: string): boolean {
  return status === "success" && tx.to !== null &&
    tx.to.toLowerCase() !== zeroAddress && tx.value > 0n && tx.input === "0x";
}
