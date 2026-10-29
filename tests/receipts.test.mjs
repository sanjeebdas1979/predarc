import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { paymentValue, isDirectPayment } from "../src/lib/receipts-core.ts";

test("native USDC uses 18 decimals without float rounding", () => {
  assert.equal(paymentValue("0.000001"), 1000000000000n);
  assert.equal(paymentValue("1.234567"), 1234567000000000000n);
  assert.equal(paymentValue("10"), 10000000000000000000n);
});
test("Base official USDC uses 6 decimals without float rounding", () => {
  assert.equal(paymentValue("0.000001", 6), 1n);
  assert.equal(paymentValue("1.234567", 6), 1234567n);
  assert.equal(paymentValue("10", 6), 10000000n);
});
test("invalid or over-limit amounts are rejected", () => {
  for (const value of ["0", "-1", "1e2", "NaN", "", ".1", "01", "0.0000001", "10.000001", "1."]) {
    assert.throws(() => paymentValue(value), value);
  }
});
const tx = { to: "0x1111111111111111111111111111111111111111", value: 1n, input: "0x" };
test("successful native transfer is supported", () => assert.equal(isDirectPayment(tx, "success"), true));
test("reverted transaction is never a receipt", () => assert.equal(isDirectPayment(tx, "reverted"), false));
test("zero-value transaction is not a payment", () => assert.equal(isDirectPayment({...tx, value: 0n}, "success"), false));
test("contract creation is not a payment receipt", () => assert.equal(isDirectPayment({...tx, to: null}, "success"), false));
test("ERC20 and other calldata are rejected", () => assert.equal(isDirectPayment({...tx, input: "0xa9059cbb"}, "success"), false));
test("zero-address transfer is rejected", () => assert.equal(isDirectPayment({...tx, to: "0x0000000000000000000000000000000000000000"}, "success"), false));

test("Base receipt verification requires official USDC calldata and matching event", () => {
  const route = readFileSync(
    new URL("../src/app/api/receipts/[hash]/route.ts", import.meta.url),
    "utf8"
  );
  assert.match(route, /decodeFunctionData/);
  assert.match(route, /decoded\.functionName !== "transfer"/);
  assert.match(route, /decodeEventLog/);
  assert.match(route, /event\.eventName === "Transfer"/);
  assert.match(route, /receipt\.status !== "success"/);
});
