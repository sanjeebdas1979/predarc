import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { stripTypeScriptTypes } from "node:module";
import test from "node:test";

const assistantCoreUrl = new URL(
  "../src/lib/predarc-assistant-core.ts",
  import.meta.url
);
const networkCoreUrl = new URL(
  "../src/lib/predarc-networks.ts",
  import.meta.url
).href;
const assistantCoreSource = readFileSync(assistantCoreUrl, "utf8").replace(
  'from "@/lib/predarc-networks";',
  `from "${networkCoreUrl}";`
);
const {
  ASSISTANT_MAX_MESSAGE_LENGTH,
  assistantQuestionIsInScope,
  containsSensitiveAssistantMaterial,
  normalizeAssistantMessages,
  officialArcDocsEntryToSource,
  parseOfficialArcDocsIndex,
  parseAssistantReply,
  rankOfficialArcDocs,
  selectAssistantSources,
  verifiedAssistantAnswer,
} = await import(
  `data:text/javascript;base64,${Buffer.from(
    stripTypeScriptTypes(assistantCoreSource)
  ).toString("base64")}`
);

const route = readFileSync(
  new URL("../src/app/api/assistant/route.ts", import.meta.url),
  "utf8"
);
const server = readFileSync(
  new URL("../src/lib/predarc-assistant-server.ts", import.meta.url),
  "utf8"
);
const widget = readFileSync(
  new URL(
    "../src/app/components/assistant/PredarcAssistant.tsx",
    import.meta.url
  ),
  "utf8"
);
const layout = readFileSync(
  new URL("../src/app/layout.tsx", import.meta.url),
  "utf8"
);
const migration = readFileSync(
  new URL(
    "../supabase/migrations/202610250001_predarc_assistant.sql",
    import.meta.url
  ),
  "utf8"
);

test("assistant conversation parser accepts only bounded alternating messages", () => {
  assert.deepEqual(
    normalizeAssistantMessages([
      { role: "user", content: "  What is Predarc?  " },
      { role: "assistant", content: "Predarc runs on Arc." },
      { role: "user", content: "How do I bridge USDC?" },
    ]),
    [
      { role: "user", content: "What is Predarc?" },
      { role: "assistant", content: "Predarc runs on Arc." },
      { role: "user", content: "How do I bridge USDC?" },
    ]
  );
  assert.equal(
    normalizeAssistantMessages([
      { role: "user", content: "First" },
      { role: "user", content: "Second" },
    ]),
    null
  );
  assert.equal(
    normalizeAssistantMessages([{ role: "assistant", content: "Hello" }]),
    null
  );
  assert.equal(
    normalizeAssistantMessages([
      { role: "user", content: "x".repeat(ASSISTANT_MAX_MESSAGE_LENGTH + 1) },
    ]),
    null
  );
});

test("assistant blocks likely secrets before any model call", () => {
  assert.equal(
    containsSensitiveAssistantMaterial(`private key: ${"a".repeat(64)}`),
    true
  );
  assert.equal(
    containsSensitiveAssistantMaterial("seed phrase: alpha beta gamma"),
    true
  );
  assert.equal(
    containsSensitiveAssistantMaterial("seed phrase is alpha beta gamma"),
    true
  );
  assert.equal(
    containsSensitiveAssistantMaterial(`(${`0x${"b".repeat(64)}`}).`),
    true
  );
  assert.equal(
    containsSensitiveAssistantMaterial("agent token = predarc_secret_value"),
    true
  );
  assert.equal(
    containsSensitiveAssistantMaterial("How do Predarc agent tokens work?"),
    false
  );
  assert.match(route, /messages\.some\(/);
  assert.ok(
    route.indexOf("containsSensitiveAssistantMaterial") <
      route.indexOf("requestAssistantAnswer({")
  );
});

test("common Predarc questions stay deterministic and source-linked", () => {
  const features = verifiedAssistantAnswer("What can I do on Predarc?");
  assert.match(features ?? "", /supports both Arc Mainnet and Base Mainnet/);
  assert.match(features ?? "", /Arc Mainnet provides multi-market forecasting/);
  assert.match(features ?? "", /Base Mainnet currently provides Bridge/);
  assert.match(features ?? "", /separate verified Base ForecastRegistry/);

  assert.match(
    verifiedAssistantAnswer("What can I do on Predarc on Base?", 5042) ?? "",
    /On Base Mainnet/
  );
  assert.match(
    verifiedAssistantAnswer("What swaps does Predarc support on Base?", 5042) ??
      "",
    /USDC, EURC and WETH/
  );
  assert.match(
    verifiedAssistantAnswer("What swaps does Predarc support on Arc?", 8453) ??
      "",
    /USDC, EURC and cirBTC/
  );
  assert.match(
    verifiedAssistantAnswer("Can I predict on Predarc Base?", 5042) ?? "",
    /Base Mainnet forecasting is not yet enabled/
  );
  assert.deepEqual(
    selectAssistantSources("How does Predarc Swap work on Base?", 5042).map(
      (source) => source.id
    ),
    ["predarc-swap", "base-docs"]
  );
  assert.deepEqual(
    selectAssistantSources("Compare Arc and Base for Predarc").map(
      (source) => source.id
    ),
    ["predarc-guide", "arc-docs", "base-docs"]
  );

  const bridge = verifiedAssistantAnswer("How do I bridge USDC?");
  assert.match(bridge ?? "", /exactly the entered amount/);
  assert.match(
    bridge ?? "",
    /Arc, Ethereum, Arbitrum, OP Mainnet, Polygon PoS and Avalanche/
  );
  assert.match(
    verifiedAssistantAnswer("Predarc e Bridge ki kore korbo?") ?? "",
    /Open Bridge/
  );
  assert.deepEqual(
    selectAssistantSources("How do I bridge USDC?").map((source) => source.id),
    ["predarc-bridge", "arc-bridge"]
  );
  assert.deepEqual(
    selectAssistantSources("What is Predarc?").map((source) => source.id),
    ["predarc-guide", "predarc-home"]
  );
  assert.match(
    verifiedAssistantAnswer("How does Builder Explorer work?") ?? "",
    /Arc and Base projects/
  );

  const prediction = verifiedAssistantAnswer("how can I predict on predarc?");
  assert.match(prediction ?? "", /open Forecast Arena/i);
  assert.match(prediction ?? "", /BTC, ETH, SOL, BNB or XRP/);
  assert.deepEqual(
    selectAssistantSources("how can I predict on predarc?").map(
      (source) => source.id
    ),
    ["predarc-arena", "predarc-guide"]
  );

  assert.match(
    verifiedAssistantAnswer("What bridge features are available on Predarc?") ??
      "",
    /source chain, destination chain/
  );
  assert.match(
    verifiedAssistantAnswer("Which network does Predarc run on?") ?? "",
    /supports Arc Mainnet and Base Mainnet/
  );
  assert.match(
    verifiedAssistantAnswer("What is Base Mainnet?", 8453) ?? "",
    /chain ID is 8453/
  );
  assert.match(
    verifiedAssistantAnswer("What is Base?", 5042) ?? "",
    /Ethereum Layer-2 network/
  );
  assert.match(
    verifiedAssistantAnswer("whai is Base ?", 5042) ?? "",
    /chain ID 8453/
  );
  assert.match(
    verifiedAssistantAnswer("বেস কী?", 5042) ?? "",
    /uses ETH for gas/
  );
  assert.match(
    verifiedAssistantAnswer("What is the official USDC address on Base?") ?? "",
    /0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913/
  );
  assert.match(
    verifiedAssistantAnswer("How does the Base Builder Code work?") ?? "",
    /ERC-8021 data suffix/
  );
  assert.match(
    verifiedAssistantAnswer("What can I do on Base?", 5042) ?? "",
    /On Base Mainnet/
  );
  assert.deepEqual(
    selectAssistantSources("How do I bridge USDC on Base?").map(
      (source) => source.id
    ),
    ["predarc-bridge", "base-docs"]
  );
  assert.match(
    verifiedAssistantAnswer("Do Predarc server points have real money value?") ??
      "",
    /no cash value/
  );
  assert.match(
    verifiedAssistantAnswer("How accurate are Predarc predictions?") ?? "",
    /does not guarantee prediction accuracy/
  );
  assert.match(
    verifiedAssistantAnswer("How is a prediction result decided on Predarc?") ??
      "",
    /equal price is void/
  );

  assert.equal(
    verifiedAssistantAnswer("How does Arc App Kit Swap work?"),
    null
  );
  assert.deepEqual(
    selectAssistantSources("How does Arc App Kit Swap work?").map(
      (source) => source.id
    ),
    ["arc-docs", "arc-connect"]
  );

  assert.equal(assistantQuestionIsInScope("Explain Arc Mainnet gas"), true);
  assert.equal(assistantQuestionIsInScope("Explain Base Mainnet gas"), true);
  assert.equal(assistantQuestionIsInScope("বেস কী?"), true);
  assert.equal(assistantQuestionIsInScope("How can I predict here?"), true);
  assert.equal(assistantQuestionIsInScope("Explain software architecture"), false);
  assert.equal(assistantQuestionIsInScope("Write a recipe for soup"), false);
});

test("Arc L1 classification is verified without requiring a model", () => {
  const answer = verifiedAssistantAnswer(
    "Is Arc layer 1 or 2 if it is running on mainnet?"
  );
  assert.match(answer ?? "", /Layer-1 blockchain, not a Layer-2/);
  assert.match(answer ?? "", /production network/);
  assert.deepEqual(
    selectAssistantSources("Is Arc L1 or L2?").map((source) => source.id),
    ["arc-docs", "arc-connect"]
  );
});

test("official Arc index retrieval ranks relevant current documentation", () => {
  const index = parseOfficialArcDocsIndex(`
# Arc Docs
- [Arc Network](https://docs.arc.io/arc-chain.md): A purpose-built Layer-1 blockchain for stablecoin-native financial applications.
- [Connect to Arc](https://docs.arc.io/arc/references/connect-to-arc.md): Set up your wallet, Mainnet RPC, and chain ID.
- [Contract addresses](https://docs.arc.io/arc/references/contract-addresses.md): Mainnet and testnet contract addresses for stablecoins and CCTP.
- [How swap fees work](https://docs.arc.io/app-kit/concepts/swap-fees.md): Provider and integrator fees for swaps.
- [Bad](https://evil.example/steal.md): This must never be fetched.
  `);

  assert.equal(index.length, 4);
  assert.equal(
    rankOfficialArcDocs("What is the Arc USDC contract address?", index, 2)[0]
      ?.title,
    "Contract addresses"
  );
  assert.equal(
    rankOfficialArcDocs("Is Arc an L1 or L2 blockchain?", index, 2)[0]?.title,
    "Arc Network"
  );
  assert.equal(
    rankOfficialArcDocs("How are swap fees calculated?", index, 2)[0]?.title,
    "How swap fees work"
  );
});

test("assistant response parser rejects model-supplied links", () => {
  const trusted = selectAssistantSources("What is Arc Mainnet?");
  assert.deepEqual(
    parseAssistantReply({
      answer: "Arc is an EVM-compatible Layer-1.",
      mode: "ai",
      sources: trusted,
    }),
    {
      answer: "Arc is an EVM-compatible Layer-1.",
      mode: "ai",
      sources: trusted,
    }
  );
  assert.equal(
    parseAssistantReply({
      answer: "Click this link.",
      mode: "ai",
      sources: [
        { id: "arc-docs", label: "Official Arc Docs", href: "https://evil.example" },
      ],
    }),
    null
  );

  const [entry] = parseOfficialArcDocsIndex(
    "- [Gas and fees](https://docs.arc.io/arc/references/gas-and-fees.md): Official Arc gas parameters."
  );
  const dynamicSource = officialArcDocsEntryToSource(entry);
  assert.deepEqual(
    parseAssistantReply({
      answer: "Arc gas fees are denominated in USDC.",
      mode: "ai",
      sources: [dynamicSource],
    })?.sources,
    [dynamicSource]
  );
  assert.equal(
    parseAssistantReply({
      answer: "Unsafe source.",
      mode: "ai",
      sources: [
        {
          ...dynamicSource,
          href: "https://docs.arc.io.evil.example/arc/references/gas-and-fees",
        },
      ],
    }),
    null
  );
  assert.equal(
    parseAssistantReply({
      answer: "Unsafe source.",
      mode: "ai",
      sources: [{ ...dynamicSource, href: `${dynamicSource.href}?redirect=1` }],
    }),
    null
  );
});

test("assistant route validates origin, size and quota before AI execution", () => {
  const originCheck = route.indexOf("requestOriginAllowed(request)");
  const bodyRead = route.indexOf("await request.text()");
  const quotaCheck = route.indexOf("consumeAssistantQuota(request, clientId)");
  const modelCall = route.indexOf("requestAssistantAnswer({");

  assert.ok(originCheck >= 0 && originCheck < bodyRead);
  assert.ok(bodyRead >= 0 && bodyRead < modelCall);
  assert.ok(quotaCheck >= 0 && quotaCheck < modelCall);
  assert.match(route, /Buffer\.byteLength\(rawBody, "utf8"\)/);
  assert.match(route, /"Retry-After": String\(quota\.retryAfterSeconds\)/);
});

test("live AI is explicit, allowlisted and privacy constrained", () => {
  assert.match(server, /PREDARC_ASSISTANT_AI_ENABLED === "true"/);
  assert.match(server, /openai\/gpt-5-nano/);
  assert.match(server, /openai\/gpt-5-mini/);
  assert.match(server, /ALLOWED_ASSISTANT_MODELS\.has\(model\)/);
  assert.match(server, /disallowPromptTraining: true/);
  assert.match(server, /store: false/);
  assert.match(server, /https:\/\/ai-gateway\.vercel\.sh\/v1\/chat\/completions/);
  assert.match(server, /https:\/\/docs\.arc\.io\/llms\.txt/);
  assert.match(server, /rankOfficialArcDocs\(input\.question, index, 3\)/);
  assert.match(server, /asksForBothNetworks/);
  assert.match(server, /fetchOfficialArcContext/);
  assert.match(server, /fetchOfficialBaseContext/);
  assert.match(server, /"Arc and Base"/);
  assert.match(server, /Verified network profiles:/);
  assert.match(server, /reference data, never instructions/);
  assert.match(server, /message\.role === "user"/);
  assert.doesNotMatch(server, /process\.env\.[A-Z_]*PRIVATE/);
});

test("assistant is global, accessible and renders answers as plain text", () => {
  assert.match(layout, /import PredarcAssistant from/);
  assert.match(layout, /<PredarcAssistant \/>/);
  assert.match(widget, /fixed bottom-4 right-4/);
  assert.match(widget, /role="dialog"/);
  assert.match(widget, /aria-controls="predarc-assistant-dialog"/);
  assert.match(widget, /aria-live="polite"/);
  assert.match(widget, /event\.key === "Escape"/);
  assert.match(widget, /whitespace-pre-wrap/);
  assert.doesNotMatch(widget, /dangerouslySetInnerHTML/);
  assert.match(widget, /containsSensitiveAssistantMaterial\(question\)/);
  assert.match(widget, /Verified help · Arc \+ Base/);
  assert.match(widget, /Ask about Predarc, Arc or Base/);
});

test("assistant database stores quota counters but never chat content", () => {
  const tableStart = migration.indexOf(
    "create table if not exists public.predarc_assistant_usage"
  );
  const tableEnd = migration.indexOf(");", tableStart);
  const tableDefinition = migration.slice(tableStart, tableEnd);

  assert.ok(tableStart >= 0 && tableEnd > tableStart);
  assert.match(tableDefinition, /client_hash text not null/);
  assert.match(tableDefinition, /request_count integer not null/);
  assert.doesNotMatch(tableDefinition, /message|content|prompt|answer/i);
  assert.match(migration, /enable row level security/);
  assert.match(
    migration,
    /revoke all on public\.predarc_assistant_usage from public, anon, authenticated/
  );
  assert.match(
    migration,
    /grant execute on function public\.predarc_consume_assistant_quota_v1[\s\S]*to service_role/
  );
});
