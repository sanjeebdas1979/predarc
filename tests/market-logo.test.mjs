import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const marketLogo = readFileSync(
  new URL("../src/app/components/market/MarketLogo.tsx", import.meta.url),
  "utf8"
);

test("Ethereum keeps its official logo with an isolated visibility boost", () => {
  assert.match(
    marketLogo,
    /ETH: "https:\/\/cdn\.simpleicons\.org\/ethereum\/627EEA"/
  );
  assert.match(marketLogo, /market === "ETH"/);
  assert.match(marketLogo, /brightness\(1\.3\) saturate\(1\.25\)/);
  assert.match(
    marketLogo,
    /drop-shadow\(0 0 7px rgba\(132, 147, 255, 0\.78\)\)/
  );
  assert.match(marketLogo, /style=\{logoStyle\}/);
});
