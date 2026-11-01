import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  createWalletVerificationTransaction,
  WALLET_VERIFICATION_CALL_DATA,
} from "../src/lib/wallet-verification.ts";

const BASE_CHAIN_ID = 8453;
const BASE_REGISTRY = "0xb49E84D870C2E7aDC20c6099be715C7E66EE09c7";
const EXAMPLE_SUFFIX =
  "0x62635f6339647a396e67630b0080218021802180218021802180218021";

test("wallet verification calls the registry without transferring funds", () => {
  const transaction = createWalletVerificationTransaction(
    BASE_REGISTRY,
    BASE_CHAIN_ID,
    { dataSuffix: EXAMPLE_SUFFIX }
  );

  assert.equal(transaction.to, BASE_REGISTRY);
  assert.equal(transaction.chainId, BASE_CHAIN_ID);
  assert.equal(transaction.value, 0n);
  assert.equal(transaction.data, "0x8da5cb5b");
  assert.equal(transaction.data, WALLET_VERIFICATION_CALL_DATA);
  assert.equal(transaction.dataSuffix, EXAMPLE_SUFFIX);
});

test("wallet verification never targets the connected wallet itself", async () => {
  const source = await readFile(
    new URL(
      "../src/app/components/wallet/ConnectWallet.tsx",
      import.meta.url
    ),
    "utf8"
  );

  assert.match(source, /getForecastRegistryAddress\(/);
  assert.match(
    source,
    /createWalletVerificationTransaction\(\s*forecastRegistryAddress,\s*forecastChainId,\s*\{\s*\.\.\.baseBuilderAttribution\(/
  );
  assert.doesNotMatch(
    source,
    /sendTransactionAsync\(\s*\{\s*to:\s*address/
  );
});
