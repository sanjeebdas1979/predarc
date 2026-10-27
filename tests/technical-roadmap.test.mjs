import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const [readme, roadmap] = await Promise.all([
  readFile(new URL("../README.md", import.meta.url), "utf8"),
  readFile(
    new URL("../docs/TECHNICAL-ROADMAP.md", import.meta.url),
    "utf8"
  ),
]);

test("README identifies Predarc and links the grant roadmap", () => {
  assert.match(readme, /^# Predarc/m);
  assert.ok(readme.includes("https://www.predarc.xyz"));
  assert.ok(readme.includes("docs/TECHNICAL-ROADMAP.md"));
  assert.match(
    readme,
    /Forecast Arena and Community Markets use server demo points with no cash value/
  );
  assert.doesNotMatch(readme, /bootstrapped with.*create-next-app/i);
});

test("technical roadmap makes Circle and Arc architectural dependencies explicit", () => {
  for (const requiredText of [
    "Arc Mainnet",
    "Native USDC",
    "Circle App Kit Bridge",
    "Circle App Kit Swap",
    "Circle viem adapter",
    "Circle Gateway",
  ]) {
    assert.match(roadmap, new RegExp(requiredText));
  }
});

test("technical roadmap defines measurable grant milestones and evidence", () => {
  assert.ok(
    roadmap.includes(
      "**Delivery window:** 16 weeks from grant activation"
    )
  );
  assert.equal((roadmap.match(/^### Milestone [1-4]/gm) ?? []).length, 4);
  assert.equal(
    roadmap
      .split("\n")
      .filter((line) => line.startsWith("**Acceptance evidence")).length,
    4
  );
  assert.match(roadmap, /at least 100 unique connected wallets/);
  assert.match(roadmap, /zero unresolved critical findings/);
});

test("roadmap preserves non-custodial and non-cash safety boundaries", () => {
  assert.match(roadmap, /Predarc is non-custodial/);
  assert.match(
    roadmap,
    /Forecasting remains a demo-points experience with no cash value/
  );
  assert.match(
    roadmap,
    /private keys, seed phrases and bearer tokens are never analytics\s+inputs/
  );
});
