import test from "node:test";
import assert from "node:assert/strict";

import {
  describeAccountRpcShape,
  normalizePredarcAccountRpc,
} from "../src/lib/predarc-account-core.ts";

const wallet = `0x${"a".repeat(40)}`;
const chainId = 5042;
const account = {
  wallet,
  chainId,
  balance: "1000",
  sessionExpiresAt: "2030-01-01T00:00:00.000Z",
};

test("account RPC accepts direct and production-compatible wrapped results", () => {
  for (const value of [
    account,
    [account],
    { predarc_account_v1: account },
    { result: JSON.stringify(account) },
  ]) {
    assert.deepEqual(
      normalizePredarcAccountRpc(value, wallet.toUpperCase().replace("0X", "0x"), chainId),
      {
        wallet,
        balance: "1000",
        sessionExpiresAt: "2030-01-01T00:00:00.000Z",
      }
    );
  }
});

test("account RPC normalizes integer-valued numeric balances", () => {
  assert.equal(
    normalizePredarcAccountRpc({ ...account, balance: "1000.000" }, wallet, chainId)?.balance,
    "1000"
  );
  assert.equal(
    normalizePredarcAccountRpc({ ...account, balance: 1000 }, wallet, chainId)?.balance,
    "1000"
  );
});

test("account RPC rejects identity, chain and balance mismatches", () => {
  for (const value of [
    { ...account, wallet: `0x${"b".repeat(40)}` },
    { ...account, chainId: 8453 },
    { ...account, balance: "1.5" },
    { ...account, balance: "-1" },
    [account, account],
  ]) {
    assert.equal(normalizePredarcAccountRpc(value, wallet, chainId), null);
  }
});

test("account RPC diagnostics expose shape but not account values", () => {
  assert.deepEqual(describeAccountRpcShape([account]), {
    kind: "array",
    length: 1,
  });
  assert.deepEqual(describeAccountRpcShape(account), {
    kind: "object",
    keys: ["wallet", "chainId", "balance", "sessionExpiresAt"],
  });
});
