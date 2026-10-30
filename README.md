# Predarc

Predarc is a forecasting, agent-research and stablecoin application for Arc
Mainnet and Base Mainnet. It combines market forecasting, user-created markets,
bounded AI-agent permissions, USDC movement and verifiable activity in one
product.

- Live application: https://www.predarc.xyz
- Technical roadmap: [docs/TECHNICAL-ROADMAP.md](docs/TECHNICAL-ROADMAP.md)
- Product guide: https://www.predarc.xyz/guide

## Product status

Predarc is a working product, not a concept or presentation. The current public
release supports network-bound Arc and Base flows with MetaMask and Rabby.

Forecast Arena and Community Markets use server demo points with no cash value.
Bridge, Swap and opt-in paid Agent Research are separate wallet-controlled flows
that may use real assets, native USDC and provider or network fees.

## Live capabilities

- **Forecast Arena:** higher/lower forecasts for BTC, ETH, BNB, SOL and XRP
  with live market data, multiple horizons, history and deterministic settlement.
- **Community Markets:** wallet-authenticated, user-created forecast markets with
  bounded targets and public market state.
- **AI Agent Automation:** EIP-712-scoped agent permissions with market,
  duration, confidence, usage and expiry limits plus pause and permanent revoke.
- **Agent Research:** a zero-cost deterministic preview and an opt-in selected-
  network model call with an exact short-lived USDC quote, per-call and rolling
  limits, one-time wallet authorization and an immutable receipt.
- **Bridge:** USDC movement between Arc Mainnet, Base, Ethereum, Arbitrum,
  OP Mainnet, Polygon PoS and Avalanche through Circle App Kit, including
  popular bidirectional routes from Base.
- **Swap:** live Arc or Base quote and execution flows for supported routes
  involving USDC, EURC and cirBTC or WETH through Circle App Kit.
- **Receipts:** verification surfaces for supported transfers and Agent
  Research evidence, inputs, outputs and payment references.
- **Predarc Assistant:** reviewed product guidance plus retrieval from official
  Arc or Base documentation, trusted source links and explicit boundaries.

## Circle and Arc integration

| Component | Role in Predarc |
| --- | --- |
| Arc Mainnet (chain ID 5042) | Production network for wallet-controlled activity and native-USDC gas |
| Base Mainnet (chain ID 8453) | Parallel execution network with ETH gas and official ERC-20 USDC |
| Arc native USDC | Arc gas asset, bridge asset and bounded Agent Research payment asset |
| Base official USDC | Base ERC-20 bridge and bounded Agent Research payment asset; Base gas remains ETH |
| Circle App Kit | Bridge and Swap orchestration |
| Circle viem adapter | Connects App Kit flows to the user's EIP-1193 wallet provider |
| Circle-supported assets | USDC, EURC and cirBTC routes exposed when available from the live provider |
| Base Builder Code | ERC-8021 attribution on Base wallet writes, Bridge and Swap submissions |

Predarc never requests a private key or seed phrase. Users review transactions
and one-time authorizations in their own wallet.

## Local development

Requirements: Node.js 20 or newer and npm.

```bash
npm install
npm run dev
```

Open `http://localhost:3000`.

## Verification

```bash
npm test
npm run build
```

The Base forecasting contract additionally uses a pinned deployment profile:

```bash
FOUNDRY_PROFILE=base_mainnet forge test
npm run verify:forecast-bytecode
```

The test suite covers core forecasting rules, wallet sessions, Community
Markets, agent permissions, research receipts, payment boundaries, wallet
connectors and important UI contracts.

## Documentation

- [Technical Roadmap](docs/TECHNICAL-ROADMAP.md)
- [Base Mainnet integration](docs/BASE-MAINNET.md)
- [Agent Research](docs/AGENT-RESEARCH.md)
- [AI Agent Automation](docs/AGENT-AUTOMATION.md)
- [Community Markets](docs/COMMUNITY-MARKETS.md)
- [Daily Access](docs/DAILY-ACCESS.md)
- [Predarc Assistant](docs/PREDARC-ASSISTANT.md)
- [Arc and Base Builder Explorer](docs/ARC-BUILDER-EXPLORER.md)

## Safety boundary

Predarc is an experimental product. Forecast outputs and research signals are
not financial advice. Users must verify networks, assets, amounts, quotes and
recipients in their wallet before approving any real-asset action.
