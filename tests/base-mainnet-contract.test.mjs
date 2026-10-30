import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import test from "node:test";

import solc from "solc";

const contractUrl = new URL(
  "../contracts/ForecastRegistryV2.sol",
  import.meta.url
);

function stripSolidityMetadata(bytecode) {
  const metadataHexLength = Number.parseInt(bytecode.slice(-4), 16) * 2 + 4;
  return bytecode.slice(0, -metadataHexLength);
}

test("Base ForecastRegistryV2 reproduces the Arc Mainnet runtime logic", async () => {
  assert.match(solc.version(), /^0\.8\.34\+commit\.80d5c536/);

  const source = await readFile(contractUrl, "utf8");
  const input = {
    language: "Solidity",
    sources: {
      "contracts/ForecastRegistryV2.sol": { content: source },
    },
    settings: {
      optimizer: { enabled: false, runs: 200 },
      outputSelection: {
        "*": {
          "*": ["abi", "evm.deployedBytecode.object"],
        },
      },
    },
  };
  const output = JSON.parse(solc.compile(JSON.stringify(input)));
  const errors = (output.errors ?? []).filter(
    (entry) => entry.severity === "error"
  );

  assert.deepEqual(errors, []);

  const artifact =
    output.contracts["contracts/ForecastRegistryV2.sol"].ForecastRegistryV2;
  const runtime = artifact.evm.deployedBytecode.object;
  const runtimeCore = stripSolidityMetadata(runtime);
  const coreHash = createHash("sha256")
    .update(Buffer.from(runtimeCore, "hex"))
    .digest("hex");

  assert.equal(runtime.length / 2, 9_110);
  assert.equal(runtimeCore.length / 2, 9_057);
  assert.equal(
    coreHash,
    "996651076d903c1a5678e4b4d709a68e15359b8412a39e4ca2e01e21872a86be"
  );

  const functionNames = artifact.abi
    .filter((entry) => entry.type === "function")
    .map((entry) => entry.name)
    .sort();

  assert.deepEqual(functionNames, [
    "claimReward",
    "getClaimableReward",
    "getForecast",
    "hasClaimed",
    "owner",
    "paused",
    "resolveForecast",
    "setPaused",
    "submitForecast",
    "totalClaimedArenaPoints",
    "totalClaims",
    "totalForecasts",
    "totalResolvedForecasts",
    "transferOwnership",
  ]);
});

test("Base deployment profile pins the reviewed compiler settings", async () => {
  const foundry = await readFile(
    new URL("../foundry.toml", import.meta.url),
    "utf8"
  );

  assert.match(foundry, /\[profile\.base_mainnet\]/);
  assert.match(foundry, /solc_version = "0\.8\.34"/);
  assert.match(foundry, /optimizer = false/);
});

test("ForecastRegistryV2 never handles a cash payout", async () => {
  const source = await readFile(contractUrl, "utf8");

  assert.doesNotMatch(source, /\bpayable\b/);
  assert.doesNotMatch(source, /\.transfer\(|\.send\(|\.call\{\s*value/);
  assert.match(source, /non-transferable Arena Points rewards/);
});
