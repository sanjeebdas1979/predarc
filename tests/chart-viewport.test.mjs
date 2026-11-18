import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const chartSource = readFileSync(
  new URL(
    "../src/app/components/chart/BtcPriceChart.tsx",
    import.meta.url
  ),
  "utf8"
);

test("live candle updates preserve a manually dragged chart viewport", () => {
  const updateStart = chartSource.indexOf(
    "const latestCandle"
  );
  const updateEnd = chartSource.indexOf(
    "const isChangingChart",
    updateStart
  );

  assert.ok(updateStart >= 0);
  assert.ok(updateEnd > updateStart);

  const liveUpdateSource = chartSource.slice(
    updateStart,
    updateEnd
  );

  assert.match(
    chartSource,
    /shiftVisibleRangeOnNewBar:\s*true/
  );
  assert.match(
    liveUpdateSource,
    /series\.update\(\s*latestCandle\s*\)/
  );
  assert.doesNotMatch(
    liveUpdateSource,
    /scrollToRealTime\(\)/
  );
  assert.doesNotMatch(
    liveUpdateSource,
    /fitContent\(\)/
  );
});

test("initial loads and market or timeframe changes still fit all candles", () => {
  const reloadStart = chartSource.indexOf(
    "if (\n      needsCompleteReload"
  );
  const reloadEnd = chartSource.indexOf(
    "const latestCandle",
    reloadStart
  );

  assert.ok(reloadStart >= 0);
  assert.ok(reloadEnd > reloadStart);

  const reloadSource = chartSource.slice(
    reloadStart,
    reloadEnd
  );

  assert.match(
    reloadSource,
    /series\.setData\(\s*chartData\s*\)/
  );
  assert.match(
    reloadSource,
    /\.fitContent\(\)/
  );
});
