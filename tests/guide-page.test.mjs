import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const landing = readFileSync(
  new URL("../src/app/page.tsx", import.meta.url),
  "utf8"
);
const guide = readFileSync(
  new URL("../src/app/guide/page.tsx", import.meta.url),
  "utf8"
);

test("landing page exposes the Predarc guide in navigation and product links", () => {
  assert.match(
    landing,
    /\{ href: "\/guide", label: "How to Use Predarc" \}/
  );
  assert.match(landing, /title: "How to use Predarc"/);
});

test("landing page links to the official Predarc X profile", () => {
  assert.match(landing, /href="https:\/\/x\.com\/predarc112000"/);
  assert.match(landing, /aria-label="Predarc on X \(opens in a new tab\)"/);
  assert.match(landing, /rel="noopener noreferrer"/);
});

test("guide covers every current public Predarc feature", () => {
  for (const heading of [
    "Connect your wallet and sign in",
    "Make a prediction in the Arena",
    "Create or join a community market",
    "Bridge USDC across supported chains",
    "Swap supported assets",
    "Connect an AI agent",
    "Verify a supported receipt",
    "Explore public Arc projects",
  ]) {
    assert.ok(guide.includes(heading), `Missing guide section: ${heading}`);
  }
});

test("guide keeps important wallet and agent safety boundaries visible", () => {
  assert.match(guide, /signature is gas-free and is not a token approval/);
  assert.match(guide, /does not request an unlimited approval/);
  assert.match(guide, /Never share your seed phrase or private key/);
  assert.match(guide, /Never publish the token, commit it to Git or paste it into chat/);
});
