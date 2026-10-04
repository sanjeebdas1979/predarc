import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import {
  buildAgentAuthorizationTypedData,
  canonicalAgentPolicy,
  normalizeAgentAutomationPolicy,
  normalizeAgentPredictionInput,
  parseAgentConnectionsResponse,
} from "../src/lib/agent-automation-core.ts";

const now = Date.parse("2026-10-04T12:00:00.000Z");
const expiresAt = new Date(now + 7 * 24 * 60 * 60_000).toISOString();
const challengeId = "123e4567-e89b-42d3-a456-426614174000";
const wallet = `0x${"a".repeat(40)}`;

const policyInput = {
  name: "Predarc Copilot",
  allowedMarkets: ["ETH", "BTC"],
  allowedDurations: [300, 60],
  maxPointsPerPrediction: 25,
  maxDailyPoints: 100,
  maxDailyPredictions: 5,
  minimumConfidence: 70,
  expiresAt,
};

test("agent policy normalizes bounded wallet authorization", () => {
  const policy = normalizeAgentAutomationPolicy(policyInput, now);

  assert.deepEqual(policy?.allowedMarkets, ["BTC", "ETH"]);
  assert.deepEqual(policy?.allowedDurations, [60, 300]);
  assert.equal(policy?.maxPointsPerPrediction, 25);
  assert.match(canonicalAgentPolicy(policy), /"minimumConfidence":70/);

  assert.equal(
    normalizeAgentAutomationPolicy(
      { ...policyInput, maxDailyPoints: 20 },
      now
    ),
    null
  );
  assert.equal(
    normalizeAgentAutomationPolicy(
      { ...policyInput, allowedMarkets: [] },
      now
    ),
    null
  );
  assert.equal(
    normalizeAgentAutomationPolicy(
      {
        ...policyInput,
        expiresAt: new Date(now + 31 * 24 * 60 * 60_000).toISOString(),
      },
      now
    ),
    null
  );
});

test("typed authorization binds identity, scope, limits and expiry", () => {
  const policy = normalizeAgentAutomationPolicy(policyInput, now);
  assert.ok(policy);

  const typedData = buildAgentAuthorizationTypedData({
    wallet,
    chainId: 5042,
    challengeId,
    nonce: "b".repeat(64),
    policy,
  });

  assert.equal(typedData.domain.name, "Predarc Agent Automation");
  assert.equal(typedData.domain.chainId, 5042);
  assert.equal(typedData.message.wallet, wallet);
  assert.equal(typedData.message.challengeId, challengeId);
  assert.equal(typedData.message.markets, "BTC,ETH");
  assert.equal(typedData.message.durations, "60,300");
  assert.equal(typedData.message.maxDailyPoints, 100n);
  assert.equal(
    typedData.message.expiresAt,
    BigInt(Math.floor(Date.parse(expiresAt) / 1000))
  );
});

test("automated prediction input rejects out-of-policy shapes early", () => {
  const input = {
    requestId: challengeId,
    market: "BTC",
    direction: "higher",
    points: 25,
    durationSeconds: 300,
    confidence: 78,
    rationale: "Momentum and volume agree.",
  };

  assert.deepEqual(normalizeAgentPredictionInput(input), input);
  assert.equal(normalizeAgentPredictionInput({ ...input, confidence: 101 }), null);
  assert.equal(normalizeAgentPredictionInput({ ...input, market: "DOGE" }), null);
  assert.equal(
    normalizeAgentPredictionInput({ ...input, rationale: "x".repeat(501) }),
    null
  );
});

test("agent connection response parser accepts only whitelisted fields", () => {
  const response = {
    connections: [
      {
        id: challengeId,
        ...policyInput,
        status: "active",
        dailyPointsUsed: "25",
        dailyPredictionsUsed: 1,
        totalPredictions: "4",
        lastUsedAt: "2026-10-04T11:00:00.000Z",
        createdAt: "2026-10-04T10:00:00.000Z",
      },
    ],
  };

  assert.equal(parseAgentConnectionsResponse(response)?.[0]?.name, "Predarc Copilot");
  assert.equal(
    parseAgentConnectionsResponse({
      connections: [{ ...response.connections[0], dailyPointsUsed: "-1" }],
    }),
    null
  );
});

test("browser agent-management routes authenticate before database writes", () => {
  const paths = [
    "../src/app/api/agents/challenge/route.ts",
    "../src/app/api/agents/route.ts",
  ];

  for (const path of paths) {
    const source = readFileSync(new URL(path, import.meta.url), "utf8");
    const originCheck = source.indexOf("requestOriginAllowed(request)");
    const sessionCheck = source.indexOf("readAuthSession(request)");
    const firstWriteCandidates = [source.indexOf(".insert("), source.indexOf(".rpc(")]
      .filter((index) => index >= 0);
    const firstWrite = Math.min(...firstWriteCandidates);

    assert.ok(originCheck >= 0, `${path} must validate its origin`);
    assert.ok(sessionCheck >= 0, `${path} must validate its session`);
    assert.ok(firstWriteCandidates.length > 0, `${path} must contain a write`);
    assert.ok(originCheck < firstWrite);
    assert.ok(sessionCheck < firstWrite);
  }
});

test("agent endpoint hashes bearer tokens and database enforces limits atomically", () => {
  const route = readFileSync(
    new URL("../src/app/api/agents/predictions/route.ts", import.meta.url),
    "utf8"
  );
  const migration = readFileSync(
    new URL(
      "../supabase/migrations/202610040001_agent_automation.sql",
      import.meta.url
    ),
    "utf8"
  );

  assert.ok(route.indexOf("readAgentBearerToken") < route.indexOf(".rpc("));
  assert.ok(route.indexOf("hashAgentApiToken(token)") < route.indexOf(".rpc("));
  assert.doesNotMatch(migration, /\bapi_token\b/);
  assert.match(migration, /token_hash text not null unique/);
  assert.match(migration, /for update/);
  assert.match(migration, /daily_predictions_used >= v_connection\.max_daily_predictions/);
  assert.match(migration, /daily_points_used \+ p_points > v_connection\.max_daily_points/);
  assert.match(migration, /p_confidence < v_connection\.minimum_confidence/);
  assert.match(migration, /v_connection\.expires_at <= v_now/);
  assert.match(migration, /status = 'revoked'/);
});
