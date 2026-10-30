import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import solc from "solc";

const ARC_RPC_URL = "https://rpc.mainnet.arc.io";
const ARC_FORECAST_REGISTRY =
  "0x92A7a9F8ee4537414ACb3d2Bb35E5976B8F48Df9";

function stripSolidityMetadata(bytecode) {
  const metadataHexLength = Number.parseInt(bytecode.slice(-4), 16) * 2 + 4;
  return bytecode.slice(0, -metadataHexLength).toLowerCase();
}

const source = await readFile(
  new URL("../contracts/ForecastRegistryV2.sol", import.meta.url),
  "utf8"
);
const input = {
  language: "Solidity",
  sources: {
    "contracts/ForecastRegistryV2.sol": { content: source },
  },
  settings: {
    optimizer: { enabled: false, runs: 200 },
    outputSelection: {
      "*": {
        "*": ["evm.deployedBytecode.object"],
      },
    },
  },
};
const output = JSON.parse(solc.compile(JSON.stringify(input)));
const errors = (output.errors ?? []).filter(
  (entry) => entry.severity === "error"
);

assert.deepEqual(errors, [], "ForecastRegistryV2 must compile cleanly");
assert.match(
  solc.version(),
  /^0\.8\.34\+commit\.80d5c536/,
  "The comparison must use Solidity 0.8.34"
);

const localRuntime =
  output.contracts["contracts/ForecastRegistryV2.sol"].ForecastRegistryV2.evm
    .deployedBytecode.object;
const response = await fetch(ARC_RPC_URL, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({
    jsonrpc: "2.0",
    id: 1,
    method: "eth_getCode",
    params: [ARC_FORECAST_REGISTRY, "latest"],
  }),
});

assert.equal(response.ok, true, `Arc RPC returned HTTP ${response.status}`);

const payload = await response.json();
const deployedRuntime = payload.result?.slice(2);

assert.ok(deployedRuntime, "Arc RPC did not return deployed bytecode");

const localCore = stripSolidityMetadata(localRuntime);
const deployedCore = stripSolidityMetadata(deployedRuntime);

assert.equal(localCore.length / 2, 9_057);
assert.equal(deployedCore.length / 2, 9_057);
assert.equal(
  localCore,
  deployedCore,
  "Local ForecastRegistryV2 logic differs from the Arc Mainnet deployment"
);

console.log(
  "ForecastRegistryV2 verification passed: 9,057 runtime bytes match Arc Mainnet exactly (Solidity metadata excluded)."
);
