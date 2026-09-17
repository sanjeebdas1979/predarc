const zeroAddress = "0x0000000000000000000000000000000000000000";

export function paymentValue(amount: string): bigint {
  if (!/^(0|[1-9][0-9]*)(\.[0-9]{1,6})?$/.test(amount)) {
    throw new Error("Enter a positive amount with up to 6 decimal places.");
  }
  const value = (BigInt(amount.split(".")[0]) * 10n ** 18n + BigInt((amount.split(".")[1] || "").padEnd(18, "0"))); // Arc native USDC uses 18 decimals.
  if (value <= 0n || value > 10n * 10n ** 18n) {
    throw new Error("For this testnet demo, send more than 0 and at most 10 USDC.");
  }
  return value;
}

export function isDirectPayment(tx: { to: string | null; value: bigint; input: string }, status: string): boolean {
  return status === "success" && tx.to !== null &&
    tx.to.toLowerCase() !== zeroAddress && tx.value > 0n && tx.input === "0x";
}
