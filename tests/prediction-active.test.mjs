import { test } from "node:test";
import assert from "node:assert/strict";

import {
  parseServerActivePrediction,
  selectActivePrediction,
  selectServerActivePrediction,
} from "../src/lib/prediction-active-core.ts";
import {
  submitServerPrediction,
} from "../src/lib/prediction-client.ts";

function prediction(
  id,
  market,
  duration,
  roundNumber
) {
  return {
    id,
    market,
    duration,
    roundNumber,
    status: "pending",
  };
}

test("active prediction selection never falls back across markets", () => {
  const btc = prediction(
    1,
    "BTC",
    60,
    44
  );

  assert.equal(
    selectActivePrediction(
      [btc],
      "BNB",
      60,
      44
    ),
    null
  );
});

test("active prediction selection keeps the chosen market attached", () => {
  const btc = prediction(
    1,
    "BTC",
    60,
    44
  );
  const bnb = prediction(
    2,
    "BNB",
    60,
    44
  );

  assert.equal(
    selectActivePrediction(
      [btc, bnb],
      "BNB",
      60,
      44
    ),
    bnb
  );
});

test("same-market active prediction survives a round-number refresh", () => {
  const bnb = prediction(
    2,
    "BNB",
    60,
    43
  );

  assert.equal(
    selectActivePrediction(
      [bnb],
      "BNB",
      60,
      44
    ),
    bnb
  );
});

test("server prediction parser keeps only safe active-card fields", () => {
  const parsed =
    parseServerActivePrediction({
      id: "22222222-2222-4222-8222-222222222222",
      market: "BNB",
      direction: "lower",
      points: "100",
      durationSeconds: 60,
      status: "pending",
      entryPrice: "789.18",
      acceptedAt:
        "2026-10-04T17:00:00.000Z",
      closesAt:
        "2026-10-04T17:01:00.000Z",
      privateField:
        "must not be copied",
    });

  assert.deepEqual(
    parsed,
    {
      id: "22222222-2222-4222-8222-222222222222",
      market: "BNB",
      direction: "lower",
      points: 100,
      durationSeconds: 60,
      status: "pending",
      entryPrice: 789.18,
      acceptedAt:
        "2026-10-04T17:00:00.000Z",
      closesAt:
        "2026-10-04T17:01:00.000Z",
    }
  );

  assert.equal(
    parseServerActivePrediction({
      market: "DOGE",
    }),
    null
  );
});

test("server-backed active card selects only the requested market slot", () => {
  const btc =
    parseServerActivePrediction({
      id: "11111111-1111-4111-8111-111111111111",
      market: "BTC",
      direction: "higher",
      points: 100,
      durationSeconds: 60,
      status: "pending",
      entryPrice: 83439,
      acceptedAt:
        "2026-10-04T17:00:00.000Z",
      closesAt:
        "2026-10-04T17:01:00.000Z",
    });
  const bnb =
    parseServerActivePrediction({
      id: "22222222-2222-4222-8222-222222222222",
      market: "BNB",
      direction: "lower",
      points: 100,
      durationSeconds: 60,
      status: "pending",
      entryPrice: 789.18,
      acceptedAt:
        "2026-10-04T17:00:00.000Z",
      closesAt:
        "2026-10-04T17:01:00.000Z",
    });

  assert.ok(btc);
  assert.ok(bnb);
  assert.equal(
    selectServerActivePrediction(
      [btc, bnb],
      "BNB",
      60
    ),
    bnb
  );
});

test("server retry preserves the original idempotency request ID", async () => {
  const originalFetch =
    globalThis.fetch;
  const calls = [];

  globalThis.fetch = async (
    url,
    init
  ) => {
    calls.push({
      url,
      init,
    });

    return {
      ok: true,
      json: async () => ({
        authenticated: true,
        balance: "900",
        replayed: true,
        prediction: {
          entry_price: "789.18",
        },
      }),
    };
  };

  try {
    const requestId =
      "11111111-1111-4111-8111-111111111111";

    const result =
      await submitServerPrediction({
        requestId,
        market: "BNB",
        direction: "lower",
        points: 100,
        durationSeconds: 60,
      });

    assert.equal(
      calls.length,
      1
    );
    assert.equal(
      calls[0].url,
      "/api/predictions/submit"
    );

    const body = JSON.parse(
      calls[0].init.body
    );

    assert.equal(
      body.requestId,
      requestId
    );
    assert.equal(
      body.market,
      "BNB"
    );
    assert.equal(
      result.replayed,
      true
    );
    assert.equal(
      result.entryPrice,
      789.18
    );
  } finally {
    globalThis.fetch =
      originalFetch;
  }
});
