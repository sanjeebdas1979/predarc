import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const wagmiConfig = await readFile(
  new URL("../src/lib/wagmi.ts", import.meta.url),
  "utf8"
);
const walletSelector = await readFile(
  new URL(
    "../src/app/components/wallet/WalletConnectOptions.tsx",
    import.meta.url
  ),
  "utf8"
);

const walletConnectionSurfaces = await Promise.all(
  [
    "../src/app/components/wallet/ConnectWallet.tsx",
    "../src/app/components/agents/AgentResearchClient.tsx",
    "../src/app/components/agents/AgentAutomationClient.tsx",
    "../src/app/bridge/page.tsx",
    "../src/app/swap/page.tsx",
    "../src/app/receipts/ReceiptsClient.tsx",
    "../src/app/daily/DailyDashboard.tsx",
  ].map((path) => readFile(new URL(path, import.meta.url), "utf8"))
);

test("Wagmi exposes MetaMask and Rabby with EIP-6963 discovery", () => {
  assert.match(wagmiConfig, /target:\s*"metaMask"/);
  assert.match(wagmiConfig, /target:\s*"rabby"/);
  assert.match(wagmiConfig, /multiInjectedProviderDiscovery:\s*true/);
  assert.match(walletSelector, /rdns:\s*"io\.metamask"/);
  assert.match(walletSelector, /rdns:\s*"io\.rabby"/);
  assert.match(walletSelector, /announcedConnector\s*\?\?\s*fallbackConnector/);
});

test("wallet selector keeps both choices visible and reports safe errors", () => {
  assert.match(walletSelector, /label:\s*"MetaMask"/);
  assert.match(walletSelector, /label:\s*"Rabby"/);
  assert.match(walletSelector, /aria-label="Choose a wallet"/);
  assert.doesNotMatch(walletSelector, /seed phrase|private key/i);
  assert.doesNotMatch(walletSelector, /error\.message\s*[})]/);
});

test("every existing wallet connection surface uses the shared selector", () => {
  for (const surface of walletConnectionSurfaces) {
    assert.match(surface, /WalletConnectOptions/);
    assert.doesNotMatch(surface, /connectors\s*\[\s*0\s*\]/);
  }
});

test("transaction prompts remain wallet-neutral after Rabby support", async () => {
  const transactionSurfaces = await Promise.all(
    [
      "../src/app/components/wallet/ConnectWallet.tsx",
      "../src/app/components/prediction/PredictionPanel.tsx",
      "../src/app/components/prediction/ActivePredictionCard.tsx",
      "../src/app/components/prediction/PredictionHistory.tsx",
      "../src/app/bridge/page.tsx",
    ].map((path) => readFile(new URL(path, import.meta.url), "utf8"))
  );

  for (const surface of transactionSurfaces) {
    assert.doesNotMatch(surface, /MetaMask/);
  }
});
