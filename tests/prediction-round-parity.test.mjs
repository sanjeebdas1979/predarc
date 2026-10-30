import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import {
  detectForecastPriceScale,
  forecastDirectionForPrices,
  isForecastDirectionCorrect,
  scaleForecastPrice,
} from "../src/lib/forecast-price-core.ts";

function source(relativePath) {
  return readFileSync(
    new URL(relativePath, import.meta.url),
    "utf8"
  );
}

test("prediction direction starts at the user's submitted entry", () => {
  const candleOpen = 78_598.55;
  const submittedEntry = 78_641.88;
  const livePrice = 78_637.87;

  assert.equal(livePrice > candleOpen, true);
  assert.equal(
    forecastDirectionForPrices(
      submittedEntry,
      livePrice
    ),
    "lower"
  );
  assert.equal(
    isForecastDirectionCorrect(
      "lower",
      submittedEntry,
      livePrice
    ),
    true
  );
  assert.equal(
    isForecastDirectionCorrect(
      "higher",
      submittedEntry,
      livePrice
    ),
    false
  );
});

test("resolution preserves precise and legacy contract scales", () => {
  const entryPrice = 78_641.88;

  assert.equal(
    detectForecastPriceScale(
      78_641_880_000n,
      entryPrice
    ),
    1_000_000
  );
  assert.equal(
    detectForecastPriceScale(
      7_864_188n,
      entryPrice
    ),
    100
  );
  assert.equal(
    detectForecastPriceScale(
      1n,
      entryPrice
    ),
    null
  );
  assert.equal(
    scaleForecastPrice(
      78_637.87,
      1_000_000
    ),
    78_637_870_000n
  );
});

test("Arc and Base keep one verified entry through card and settlement", () => {
  const panel = source(
    "../src/app/components/prediction/PredictionPanel.tsx"
  );
  const provider = source(
    "../src/app/components/providers/DemoPointsProvider.tsx"
  );
  const roundProvider = source(
    "../src/app/components/providers/RoundProvider.tsx"
  );
  const activeCard = source(
    "../src/app/components/prediction/ActivePredictionCard.tsx"
  );
  const submitRoute = source(
    "../src/app/api/predictions/submit/route.ts"
  );
  const settleRoute = source(
    "../src/app/api/predictions/settle/route.ts"
  );
  const migration = source(
    "../supabase/migrations/202610300001_prediction_round_parity.sql"
  );

  const settleStart = provider.indexOf(
    "const settleRound"
  );
  const settleSource = provider.slice(
    settleStart
  );

  assert.ok(settleStart >= 0);
  assert.match(
    panel,
    /data\.price\s*\*\s*PRICE_SCALE/
  );
  assert.match(
    panel,
    /entryPrice:\s*submittedStartPrice/
  );
  assert.match(
    panel,
    /transactionHash:\s*hash/
  );
  assert.match(
    activeCard,
    /currentPrediction\.startPrice\s*\?\?\s*startPrice/
  );
  assert.doesNotMatch(
    activeCard,
    /activeRoundEntryPrice/
  );
  assert.match(
    settleSource,
    /prediction\.startPrice\s*\?\?\s*startPrice/
  );
  assert.match(
    settleSource,
    /forecastDirectionForPrices\(\s*predictionStartPrice,\s*endPrice/
  );
  assert.doesNotMatch(
    roundProvider,
    /flat candle detected/
  );
  assert.match(
    submitRoute,
    /verifyCommunityForecastTransaction/
  );
  assert.match(
    submitRoute,
    /targetPrice:\s*scaledEntryPrice/
  );
  assert.doesNotMatch(
    submitRoute,
    /fetchBinanceRoundOpen/
  );
  assert.match(
    settleRoute,
    /predarc_settle_prediction_v2/
  );
  assert.doesNotMatch(
    settleRoute,
    /p_entry_price/
  );
  assert.match(
    migration,
    /p_exit_price > v_prediction\.entry_price/
  );
  assert.match(
    migration,
    /p_exit_price < v_prediction\.entry_price/
  );
  assert.doesNotMatch(
    migration,
    /set entry_price\s*=/
  );
});
