import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  ARC_MAINNET_CHAIN_ID,
  BASE_MAINNET_CHAIN_ID,
  getForecastRegistryAddress,
  getPredarcNetwork,
  isForecastRegistryReady,
  normalizePredarcChainId,
} from "../src/lib/predarc-networks.ts";

test("Predarc exposes Arc and Base as separate production networks", () => {
  const arc = getPredarcNetwork(ARC_MAINNET_CHAIN_ID);
  const base = getPredarcNetwork(BASE_MAINNET_CHAIN_ID);

  assert.equal(arc.chainId, 5042);
  assert.equal(arc.nativeCurrency, "USDC");
  assert.equal(arc.blockRunNetwork, "eip155:5042");
  assert.equal(base.chainId, 8453);
  assert.equal(base.nativeCurrency, "ETH");
  assert.equal(base.blockRunNetwork, "eip155:8453");
  assert.equal(
    base.usdcAddress.toLowerCase(),
    "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913"
  );
  assert.equal(normalizePredarcChainId("5042"), 5042);
  assert.equal(normalizePredarcChainId("8453"), 8453);
  assert.equal(normalizePredarcChainId("1"), null);
});

test("Base forecasting fails closed until its own registry is configured", () => {
  assert.equal(
    getForecastRegistryAddress(5042)?.toLowerCase(),
    "0x92a7a9f8ee4537414acb3d2bb35e5976b8f48df9"
  );
  assert.equal(
    isForecastRegistryReady(8453),
    Boolean(getForecastRegistryAddress(8453))
  );
});

test("Base migration isolates sessions, payments and x402 assets by chain", () => {
  const migration = readFileSync(
    new URL(
      "../supabase/migrations/202610280001_base_mainnet.sql",
      import.meta.url
    ),
    "utf8"
  );

  assert.match(migration, /chain_id in \(5042002, 5042, 8453\)/);
  assert.match(migration, /chain_id in \(5042, 8453\)/);
  assert.match(migration, /network = 'eip155:8453'/);
  assert.match(
    migration,
    /asset = '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913'/
  );
  assert.match(
    migration,
    /resource->>'url' = 'https:\/\/blockrun\.ai\/api\/v1\/chat\/completions'/
  );
  assert.match(migration, /v_expected_name := 'USD Coin'/);
});

test("network-sensitive UI and APIs consume the shared selected network", () => {
  const files = [
    "../src/app/components/agents/AgentAutomationClient.tsx",
    "../src/app/components/agents/AgentResearchClient.tsx",
    "../src/app/components/assistant/PredarcAssistant.tsx",
    "../src/app/components/community/CommunityMarketsClient.tsx",
    "../src/app/components/prediction/PredictionPanel.tsx",
    "../src/app/daily/DailyDashboard.tsx",
    "../src/app/receipts/ReceiptsClient.tsx",
    "../src/app/swap/page.tsx",
  ];

  for (const path of files) {
    const source = readFileSync(new URL(path, import.meta.url), "utf8");
    assert.match(source, /usePredarcNetwork/, `${path} must use selected network`);
  }
});

test("wallet and settlement flows stay bound to the selected network", () => {
  const connectWallet = readFileSync(
    new URL(
      "../src/app/components/wallet/ConnectWallet.tsx",
      import.meta.url
    ),
    "utf8"
  );
  const settleRoute = readFileSync(
    new URL(
      "../src/app/api/predictions/settle/route.ts",
      import.meta.url
    ),
    "utf8"
  );

  assert.match(connectWallet, /<PredarcNetworkSelector \/>/);
  assert.match(settleRoute, /\.eq\("chain_id", session\.chainId\)/);
});
