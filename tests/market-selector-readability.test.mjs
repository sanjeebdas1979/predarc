import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const marketSelector = await readFile(
  new URL(
    "../src/app/components/market/MarketSelector.tsx",
    import.meta.url
  ),
  "utf8"
);

test("market selection guidance remains clearly readable", () => {
  assert.match(
    marketSelector,
    /className="text-sm font-medium leading-5 text-slate-300"/
  );
  assert.match(
    marketSelector,
    /Choose another asset before submitting your next forecast\./
  );
  assert.doesNotMatch(
    marketSelector,
    /className="text-xs text-gray-600">\s*\{canChangeMarket/
  );
});
