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

test("landing footer links to the official Arc documentation", () => {
  assert.match(landing, /href="https:\/\/docs\.arc\.network"/);
  assert.match(landing, /aria-label="Docs \(opens in a new tab\)"/);
  assert.match(landing, />\s*Docs ↗\s*<\/a>/);
});

test("landing footer links to the official Arc GitHub repository", () => {
  assert.match(landing, /href="https:\/\/github\.com\/circlefin\/arc-node"/);
  assert.match(landing, /aria-label="Arc GitHub \(opens in a new tab\)"/);
  assert.match(landing, />\s*Arc GitHub ↗\s*<\/a>/);
});

test("guide covers every current public Predarc feature", () => {
  for (const heading of [
    "Connect your wallet and sign in",
    "Make a prediction in the Arena",
    "Create or join a community market",
    "Bridge USDC across supported chains",
    "Swap supported assets",
    "Run the Agent Research Preview",
    "Run paid AI research on the selected network",
    "Connect an AI agent",
    "Verify a supported receipt",
    "Explore public Arc projects",
    "Ask Predarc Assistant",
  ]) {
    assert.ok(guide.includes(heading), `Missing guide section: ${heading}`);
  }
});

test("guide keeps important wallet and agent safety boundaries visible", () => {
  assert.match(guide, /signature is gas-free and is not a token approval/);
  assert.match(guide, /does not request an unlimited approval/);
  assert.match(guide, /Never share your seed phrase or private key/);
  assert.match(guide, /Never publish the token, commit it to Git or paste it into chat/);
  assert.match(guide, /charges 0 USDC/);
  assert.match(guide, /does not submit or prefill a prediction/);
  assert.match(guide, /Get Mainnet quote/);
  assert.match(guide, /BlockRun x402/);
  assert.match(guide, /maximum per-call cost and rolling 24-hour USDC cap/);
  assert.match(guide, /submitted payment is never automatically retried/);
  assert.match(guide, /cannot access your wallet, request a signature or submit a transaction/);
  assert.match(guide, /Never paste a seed phrase, private key, API key or agent token into chat/);
});

test("landing page exposes verifiable Agent Research", () => {
  assert.match(
    landing,
    /\{ href: "\/research", label: "Agent Research" \}/
  );
  assert.match(landing, /title: "Run Agent Research"/);
  assert.match(landing, /tamper-evident receipt/);
});

test("landing hero presents all primary actions with the same gradient style", () => {
  const heroActionsStart = landing.indexOf(
    '<div className="mt-9 flex flex-wrap gap-3">'
  );
  const heroActionsEnd = landing.indexOf(
    '<div className="mt-9 flex flex-wrap gap-2">',
    heroActionsStart
  );
  const heroActions = landing.slice(heroActionsStart, heroActionsEnd);

  assert.ok(heroActionsStart >= 0);
  assert.ok(heroActionsEnd > heroActionsStart);
  for (const href of ["/arena", "/markets", "/bridge"]) {
    assert.match(heroActions, new RegExp(`href="${href}"`));
  }
  assert.equal(
    (
      heroActions.match(
        /bg-gradient-to-r from-indigo-600 via-purple-600 to-pink-500/g
      ) ?? []
    ).length,
    3
  );
});

test("landing hero capability pills stay readable on the dark background", () => {
  const capabilityPillsStart = landing.indexOf(
    '<div className="mt-9 flex flex-wrap gap-2">'
  );
  const capabilityPillsEnd = landing.indexOf(
    '<div className="relative">',
    capabilityPillsStart
  );
  const capabilityPills = landing.slice(
    capabilityPillsStart,
    capabilityPillsEnd
  );

  assert.ok(capabilityPillsStart >= 0);
  assert.ok(capabilityPillsEnd > capabilityPillsStart);
  for (const label of [
    "5 crypto markets",
    "1m / 5m / 15m rounds",
    "Live candle sync",
    "Persistent wallet sign-in",
  ]) {
    assert.ok(capabilityPills.includes(label), `Missing capability: ${label}`);
  }
  assert.match(capabilityPills, /border-white\/\[0\.14\]/);
  assert.match(capabilityPills, /bg-white\/\[0\.045\]/);
  assert.match(capabilityPills, /text-\[10px\]/);
  assert.match(capabilityPills, /text-gray-300/);
  assert.doesNotMatch(capabilityPills, /text-gray-500/);
});

test("landing suite CTA keeps Launch Arena aligned with the secondary actions", () => {
  const suiteActionsStart = landing.indexOf("Built around Arc + Base Mainnet");
  const suiteActionsEnd = landing.indexOf("<footer", suiteActionsStart);
  const suiteActions = landing.slice(suiteActionsStart, suiteActionsEnd);

  assert.ok(suiteActionsStart >= 0);
  assert.ok(suiteActionsEnd > suiteActionsStart);
  for (const href of ["/arena", "/markets", "/research", "/agents"]) {
    assert.match(suiteActions, new RegExp(`href="${href}"`));
  }
  assert.match(suiteActions, /bg-indigo-400\/\[0\.08\]/);
  assert.doesNotMatch(suiteActions, /bg-gradient-to-r/);
});

test("landing Community Markets teaser keeps its small copy readable", () => {
  const teaserStart = landing.indexOf(
    '<div className="mt-4 rounded-2xl border border-blue-400/15'
  );
  const teaserEnd = landing.indexOf("</aside>", teaserStart);
  const teaser = landing.slice(teaserStart, teaserEnd);

  assert.ok(teaserStart >= 0);
  assert.ok(teaserEnd > teaserStart);
  assert.match(teaser, /text-\[10px\] leading-4 text-blue-100\/75/);
  assert.match(teaser, /text-\[10px\][^"\n]*text-blue-200/);
  assert.doesNotMatch(teaser, /text-gray-500/);
});
