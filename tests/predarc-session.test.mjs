import test from "node:test";
import assert from "node:assert/strict";
import {
  normalizeWallet,
  parsePredarcAccount,
  parsePredarcSession,
  pointsAsSafeNumber,
  sessionMatchesWallet,
} from "../src/lib/predarc-session-core.ts";

const chainId = 5042002;
const wallet = `0x${"a".repeat(40)}`;
const future = "2030-01-01T00:00:00.000Z";
const now = Date.parse("2029-01-01T00:00:00.000Z");

test("valid Predarc session is normalized and matches its connected wallet", () => {
  const session = parsePredarcSession(
    {
      authenticated: true,
      wallet: wallet.toUpperCase().replace("0X", "0x"),
      chainId,
      expiresAt: future,
    },
    chainId,
    now
  );

  assert.deepEqual(session, { wallet, chainId, expiresAt: future });
  assert.equal(sessionMatchesWallet(session, wallet.toUpperCase().replace("0X", "0x")), true);
  assert.equal(sessionMatchesWallet(session, `0x${"b".repeat(40)}`), false);
});

test("expired, wrong-chain and malformed sessions are rejected", () => {
  assert.equal(parsePredarcSession({ authenticated: false }, chainId, now), null);
  assert.equal(parsePredarcSession({ authenticated: true, wallet, chainId: 5042, expiresAt: future }, chainId, now), null);
  assert.equal(parsePredarcSession({ authenticated: true, wallet, chainId, expiresAt: "2028-01-01T00:00:00.000Z" }, chainId, now), null);
  assert.equal(normalizeWallet("0x1234"), null);
});

test("account must belong to the authenticated session", () => {
  const session = { wallet, chainId, expiresAt: future };

  assert.deepEqual(
    parsePredarcAccount(
      { authenticated: true, wallet, chainId, balance: "1000" },
      session
    ),
    { wallet, balance: "1000" }
  );
  assert.equal(
    parsePredarcAccount(
      {
        authenticated: true,
        wallet: `0x${"b".repeat(40)}`,
        chainId,
        balance: "1000",
      },
      session
    ),
    null
  );
  assert.equal(
    parsePredarcAccount(
      { authenticated: true, wallet, chainId, balance: "1.5" },
      session
    ),
    null
  );
});

test("server points convert safely for numeric controls", () => {
  assert.equal(pointsAsSafeNumber("1000"), 1000);
  assert.equal(pointsAsSafeNumber("not-a-balance"), 0);
  assert.equal(
    pointsAsSafeNumber("999999999999999999999999"),
    Number.MAX_SAFE_INTEGER
  );
});
