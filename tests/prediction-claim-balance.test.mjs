import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const historySource = readFileSync(
  new URL(
    "../src/app/components/prediction/PredictionHistory.tsx",
    import.meta.url
  ),
  "utf8"
);

test("server reward claim publishes its returned balance immediately", () => {
  const claimStart = historySource.indexOf(
    "const claimServerPrediction"
  );
  const claimEnd = historySource.indexOf(
    "Prevent automatic claim-sync",
    claimStart
  );

  assert.ok(claimStart >= 0);
  assert.ok(claimEnd > claimStart);

  const claimSource = historySource.slice(
    claimStart,
    claimEnd
  );

  assert.match(
    claimSource,
    /new CustomEvent\(\s*SERVER_BALANCE_EVENT,[\s\S]*?balance:\s*result\.balance/
  );
  assert.doesNotMatch(
    claimSource,
    /new Event\(\s*SERVER_BALANCE_EVENT/
  );
});
