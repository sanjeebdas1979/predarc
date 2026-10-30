import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  getDefaultBridgeRoute,
  getOrderedBridgeRoutes,
  getPredarcBridgeRoute,
  PREDARC_BRIDGE_ROUTES,
} from "../src/lib/predarc-bridge-routes.ts";

const bridgePage = readFileSync(
  new URL("../src/app/bridge/page.tsx", import.meta.url),
  "utf8"
);
const wagmiConfig = readFileSync(
  new URL("../src/lib/wagmi.ts", import.meta.url),
  "utf8"
);

test("Base exposes popular outbound and inbound USDC routes", () => {
  const popularPeers = [
    "Arc",
    "Ethereum",
    "Arbitrum",
    "Optimism",
    "Polygon",
    "Avalanche",
  ];

  for (const peer of popularPeers) {
    assert.ok(
      PREDARC_BRIDGE_ROUTES.some(
        (route) => route.from === "Base" && route.to === peer
      ),
      `missing Base → ${peer}`
    );
    assert.ok(
      PREDARC_BRIDGE_ROUTES.some(
        (route) => route.from === peer && route.to === "Base"
      ),
      `missing ${peer} → Base`
    );
  }
});

test("active Predarc network routes are listed first", () => {
  const baseRoutes = getOrderedBridgeRoutes("base");
  const arcRoutes = getOrderedBridgeRoutes("arc");
  const baseSourceCount = baseRoutes.filter(
    (route) => route.from === "Base"
  ).length;
  const arcSourceCount = arcRoutes.filter((route) => route.from === "Arc").length;

  assert.ok(baseSourceCount > 1);
  assert.ok(arcSourceCount > 1);
  assert.ok(
    baseRoutes.slice(0, baseSourceCount).every((route) => route.from === "Base")
  );
  assert.ok(
    arcRoutes.slice(0, arcSourceCount).every((route) => route.from === "Arc")
  );
  assert.equal(getDefaultBridgeRoute("base"), "base-arc");
  assert.equal(getDefaultBridgeRoute("arc"), "arc-base");
});

test("every configured bridge route has a reverse route and resolves by key", () => {
  for (const route of PREDARC_BRIDGE_ROUTES) {
    assert.equal(getPredarcBridgeRoute(route.key), route);
    assert.ok(
      PREDARC_BRIDGE_ROUTES.some(
        (candidate) =>
          candidate.from === route.to && candidate.to === route.from
      ),
      `missing reverse route for ${route.key}`
    );
  }
});

test("bridge UI can switch to every source network and preserves Base attribution", () => {
  assert.match(bridgePage, /getOrderedBridgeRoutes\(network\.key\)/);
  assert.match(bridgePage, /Optimism:\s*optimism\.id/);
  assert.match(bridgePage, /Avalanche:\s*avalanche\.id/);
  assert.match(bridgePage, /withBaseBuilderAttribution\(/);
  assert.match(wagmiConfig, /\boptimism\b/);
  assert.match(wagmiConfig, /\bavalanche\b/);
  assert.match(wagmiConfig, /https:\/\/mainnet\.optimism\.io/);
  assert.match(wagmiConfig, /https:\/\/api\.avax\.network\/ext\/bc\/C\/rpc/);
});
