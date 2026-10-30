import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  attributeBaseProviderRequest,
  baseBuilderAttribution,
  createBaseBuilderDataSuffix,
  normalizeBaseBuilderCode,
} from "../src/lib/base-builder-code.ts";

const BASE_CHAIN_ID = 8453;
const EXAMPLE_CODE = "bc_b7k3p9da";
const EXAMPLE_SUFFIX =
  "0x62635f62376b33703964610b0080218021802180218021802180218021";

test("Base Builder Code is validated and encoded as ERC-8021", () => {
  assert.equal(normalizeBaseBuilderCode(` ${EXAMPLE_CODE} `), EXAMPLE_CODE);
  assert.equal(createBaseBuilderDataSuffix(EXAMPLE_CODE), EXAMPLE_SUFFIX);
  assert.equal(normalizeBaseBuilderCode(undefined), undefined);
  assert.throws(() => normalizeBaseBuilderCode("INVALID-CODE"));
  assert.throws(() => normalizeBaseBuilderCode("x".repeat(33)));
});

test("attribution never leaks onto Arc or another chain", () => {
  assert.deepEqual(baseBuilderAttribution(5042), {});

  const request = {
    method: "eth_sendTransaction",
    params: [{ to: "0x0000000000000000000000000000000000000001" }],
  };

  assert.equal(
    attributeBaseProviderRequest(request, 5042, EXAMPLE_SUFFIX),
    request
  );
});

test("Base EIP-1193 transactions receive one suffix without mutation", () => {
  const request = {
    method: "eth_sendTransaction",
    params: [
      {
        to: "0x0000000000000000000000000000000000000001",
        data: "0x1234",
      },
    ],
  };

  const attributed = attributeBaseProviderRequest(
    request,
    BASE_CHAIN_ID,
    EXAMPLE_SUFFIX
  );
  const transaction = attributed.params[0];

  assert.equal(transaction.data, `0x1234${EXAMPLE_SUFFIX.slice(2)}`);
  assert.equal(request.params[0].data, "0x1234");

  const repeated = attributeBaseProviderRequest(
    attributed,
    BASE_CHAIN_ID,
    EXAMPLE_SUFFIX
  );
  assert.equal(repeated.params[0].data, transaction.data);
});

test("Base wallet_sendCalls receives the optional dataSuffix capability", () => {
  const request = {
    method: "wallet_sendCalls",
    params: [
      {
        version: "2.0.0",
        calls: [],
        capabilities: { paymasterService: { optional: true } },
      },
    ],
  };

  const attributed = attributeBaseProviderRequest(
    request,
    BASE_CHAIN_ID,
    EXAMPLE_SUFFIX
  );

  assert.deepEqual(attributed.params[0].capabilities, {
    paymasterService: { optional: true },
    dataSuffix: { value: EXAMPLE_SUFFIX, optional: true },
  });
});

test("every Predarc Base transaction surface applies attribution", async () => {
  const requiredCounts = new Map([
    ["../src/app/components/wallet/ConnectWallet.tsx", 1],
    ["../src/app/components/prediction/PredictionPanel.tsx", 1],
    ["../src/app/components/prediction/ActivePredictionCard.tsx", 2],
    ["../src/app/components/prediction/PredictionHistory.tsx", 2],
    ["../src/app/components/community/CommunityMarketsClient.tsx", 1],
    ["../src/app/daily/DailyDashboard.tsx", 1],
    ["../src/app/receipts/ReceiptsClient.tsx", 1],
  ]);

  for (const [path, minimumCount] of requiredCounts) {
    const source = await readFile(new URL(path, import.meta.url), "utf8");
    const count = (source.match(/\.\.\.baseBuilderAttribution\(/g) ?? [])
      .length;

    assert.ok(
      count >= minimumCount,
      `${path} must attribute each Base transaction`
    );
  }

  for (const path of [
    "../src/app/bridge/page.tsx",
    "../src/app/swap/page.tsx",
  ]) {
    const source = await readFile(new URL(path, import.meta.url), "utf8");
    assert.match(source, /withBaseBuilderAttribution\(/);
  }
});
