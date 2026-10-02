import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import {
  buildCommunityMarketCreationMessage,
  communityForecastIdFromRequestId,
  communityMarketResolutionTimestamp,
  communityPriceToScaledBigInt,
  communityTargetIsReasonable,
  normalizeCommunityPrice,
  parseCommunityMarketsResponse,
} from "../src/lib/community-markets-core.ts";

const requestId = "123e4567-e89b-42d3-a456-426614174000";
const wallet = `0x${"a".repeat(40)}`;
const transactionHash = `0x${"b".repeat(64)}`;

test("community prices normalize without floating-point conversion", () => {
  assert.equal(normalizeCommunityPrice(" 65000.120000 "), "65000.12");
  assert.equal(normalizeCommunityPrice("0.000001"), "0.000001");
  assert.equal(normalizeCommunityPrice("01.5"), null);
  assert.equal(normalizeCommunityPrice("0"), null);
  assert.equal(communityPriceToScaledBigInt("65000.1234567"), 65000123457n);
});

test("community targets stay inside the live-price safety range", () => {
  assert.equal(communityTargetIsReasonable("50", 100), true);
  assert.equal(communityTargetIsReasonable("150", 100), true);
  assert.equal(communityTargetIsReasonable("49.99", 100), false);
  assert.equal(communityTargetIsReasonable("150.01", 100), false);
  assert.equal(communityTargetIsReasonable("bad", 100), false);
});

test("market creation signature binds every security-sensitive field", () => {
  const message = buildCommunityMarketCreationMessage({
    requestId,
    wallet: wallet.toUpperCase().replace("0X", "0x"),
    chainId: 5042,
    asset: "BTC",
    targetPrice: "65000",
    durationSeconds: 300,
  });

  assert.match(message, /Asset: BTC/);
  assert.match(message, /Target: 65000 USDT/);
  assert.match(message, /Duration: 300 seconds/);
  assert.match(message, new RegExp(`Request ID: ${requestId}`));
  assert.match(message, new RegExp(`Wallet: ${wallet}`));
  assert.match(message, /Chain ID: 5042/);
  assert.match(message, /no gas fee or token approval/);
});

test("request UUID produces one deterministic uint256 forecast id", () => {
  assert.equal(
    communityForecastIdFromRequestId(requestId),
    BigInt(`0x${requestId.replaceAll("-", "")}`)
  );
  assert.equal(communityForecastIdFromRequestId("not-a-uuid"), null);
});

test("settlement waits for the containing minute candle plus buffer", () => {
  assert.equal(
    communityMarketResolutionTimestamp("2026-10-02T10:15:23.000Z"),
    Date.parse("2026-10-02T10:16:02.000Z")
  );
  assert.equal(communityMarketResolutionTimestamp("invalid"), null);
});

test("community market response parser accepts only whitelisted shapes", () => {
  const response = {
    markets: [
      {
        id: requestId,
        asset: "BTC",
        creatorWallet: wallet,
        targetPrice: "65000.000000000000",
        referencePrice: "64900.12",
        durationSeconds: 300,
        createdAt: "2026-10-02T10:10:00.000Z",
        closesAt: "2026-10-02T10:15:00.000Z",
        resolutionAt: "2026-10-02T10:16:02.000Z",
        status: "settled",
        outcome: "higher",
        settlementPrice: "65100",
        settledAt: "2026-10-02T10:16:04.000Z",
        participantCount: 1,
        higherPoints: "100",
        lowerPoints: "0",
        userPrediction: {
          id: "223e4567-e89b-42d3-a456-426614174000",
          direction: "higher",
          points: "100",
          status: "won",
          claimed: false,
          canClaim: true,
          transactionHash,
          onchainForecastId: "123456",
        },
      },
    ],
  };

  const parsed = parseCommunityMarketsResponse(response);
  assert.equal(parsed?.[0]?.targetPrice, "65000");
  assert.equal(parsed?.[0]?.userPrediction?.canClaim, true);

  assert.equal(
    parseCommunityMarketsResponse({
      markets: [
        {
          ...response.markets[0],
          userPrediction: {
            ...response.markets[0].userPrediction,
            transactionHash: "0x1234",
          },
        },
      ],
    }),
    null
  );
});

test("community mutation routes authenticate before database RPC calls", () => {
  const routePaths = [
    "../src/app/api/community-markets/route.ts",
    "../src/app/api/community-markets/[id]/predictions/route.ts",
    "../src/app/api/community-markets/[id]/settle/route.ts",
    "../src/app/api/community-markets/predictions/[predictionId]/claim/route.ts",
  ];

  for (const path of routePaths) {
    const source = readFileSync(new URL(path, import.meta.url), "utf8");
    const originCheck = source.indexOf("requestOriginAllowed(request)");
    const sessionCheck = source.indexOf("readAuthSession(request)");
    const firstRpc = source.indexOf(".rpc(");

    assert.ok(originCheck >= 0, `${path} must validate its origin`);
    assert.ok(sessionCheck >= 0, `${path} must validate its session`);
    assert.ok(firstRpc < 0 || originCheck < firstRpc);
    assert.ok(firstRpc < 0 || sessionCheck < firstRpc);
  }
});

test("community prediction debit requires verified Arc calldata", () => {
  const route = readFileSync(
    new URL(
      "../src/app/api/community-markets/[id]/predictions/route.ts",
      import.meta.url
    ),
    "utf8"
  );
  const verifier = readFileSync(
    new URL("../src/lib/community-markets-server.ts", import.meta.url),
    "utf8"
  );

  assert.ok(
    route.indexOf("verifyCommunityForecastTransaction") <
      route.indexOf('"predarc_submit_community_prediction_v1"')
  );
  assert.match(verifier, /getTransactionReceipt/);
  assert.match(verifier, /decodeFunctionData/);
  assert.match(verifier, /decoded\.functionName !== "submitForecast"/);
  assert.match(verifier, /!isAddressEqual\(transaction\.from, expected\.wallet/);
  assert.match(verifier, /!isAddressEqual\(transaction\.to, forecastRegistryAddress/);
});

test("community ledger rows use their own wallet-bound prediction reference", () => {
  const migrations = [
    "../supabase/migrations/202610020001_community_markets.sql",
    "../supabase/migrations/202610020002_community_ledger_reference.sql",
  ];

  for (const path of migrations) {
    const source = readFileSync(new URL(path, import.meta.url), "utf8");

    assert.match(
      source,
      /add column if not exists community_prediction_id uuid/
    );
    assert.match(
      source,
      /foreign key \(community_prediction_id, chain_id, wallet\)/
    );
    assert.match(
      source,
      /prediction_id is not null and community_prediction_id is null/
    );
    assert.match(
      source,
      /prediction_id is null and community_prediction_id is not null/
    );
    assert.match(
      source,
      /prediction_id,\s+community_prediction_id,\s+source_id/
    );
    assert.match(
      source,
      /'prediction_debit',\s+-p_points,\s+null,\s+v_prediction\.id/
    );
    assert.match(
      source,
      /v_kind,\s+v_reward,\s+null,\s+v_prediction\.id/
    );
  }
});
