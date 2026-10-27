# Predarc Technical Roadmap

**Status:** Grant application roadmap

**Baseline date:** October 27, 2026

**Delivery window:** 16 weeks from grant activation

## 1. Product objective

Predarc is building a user-controlled forecasting and agent-research layer on
Arc Mainnet. The product connects three flows that are normally fragmented:

1. users study and record a market view;
2. bounded agents obtain research without receiving custody of a wallet; and
3. users move or exchange supported Circle assets without leaving the product.

The grant objective is to turn the current working release into a measurable,
production-oriented Arc application with stronger Circle integrations,
Arc-native verification and a repeatable onboarding path.

## 2. Shipped baseline

The following capabilities are already implemented and publicly accessible:

- Arc Mainnet wallet connection with MetaMask and Rabby;
- multi-market forecasting for BTC, ETH, BNB, SOL and XRP;
- user-created Community Markets;
- wallet-signed, bounded AI-agent prediction permissions;
- free deterministic Agent Research Preview;
- opt-in Arc Mainnet Agent Research with exact USDC quotes, one-time wallet
  authorization, per-call caps, rolling 24-hour caps and immutable receipts;
- native USDC bridging between Arc, Ethereum, Base, Arbitrum and Polygon using
  Circle App Kit;
- Arc Mainnet swap quotes and execution for supported USDC, EURC and cirBTC
  routes using Circle App Kit;
- public verification surfaces for supported transfer and research receipts;
- an in-product assistant grounded in reviewed Predarc knowledge and official
  Arc documentation; and
- wallet authentication, idempotency, same-origin controls and server-enforced
  policy limits.

Forecast Arena and Community Markets currently use server demo points with no
cash value. Real assets are limited to explicit, wallet-controlled Bridge, Swap
and paid Agent Research flows.

## 3. Current architecture and product fit

| Layer | Current role | Why it matters |
| --- | --- | --- |
| Arc Mainnet | Production chain for wallet-controlled flows | Makes Arc the execution and settlement environment rather than an optional add-on |
| Native USDC | Arc gas, bridge asset and bounded research payment asset | Keeps fees and value movement denominated in a stable asset |
| Circle App Kit Bridge | Cross-chain native USDC orchestration | Brings users and USDC liquidity into and out of Arc from supported chains |
| Circle App Kit Swap | Quote and execution orchestration for supported Arc assets | Lets users move between USDC, EURC and cirBTC inside Predarc |
| Circle viem adapter | Wallet-provider connection for App Kit | Keeps transaction approval in the connected wallet |
| BlockRun x402 exact flow | Allowlisted paid model call using Arc native USDC | Demonstrates bounded machine-to-service economic activity |
| Supabase server data layer | Sessions, policy enforcement, idempotency and immutable receipt records | Prevents browser-controlled identity or spend accounting |
| Next.js application | User interface and protected API routes | Delivers one coherent workflow across forecasting, agents and stablecoin tools |

## 4. Grant milestones

Week 0 is the grant activation date. Each milestone produces reviewable code,
tests, documentation and a working deployment.

### Milestone 1 — Circle integration hardening

**Window:** Weeks 1–3

**Deliverables**

- expose clearer App Kit route, asset, network and transaction state for Bridge
  and Swap without replacing the wallet's final confirmation;
- extend receipts to bind the selected route, quoted amount, transaction hash
  and final status where the provider exposes those values;
- add automated tests for wrong-network handling, stale quotes, wallet rejection,
  provider failure and duplicate submission; and
- publish a reproducible Circle integration demo covering one bridge route and
  one Arc Mainnet swap route.

**Acceptance evidence**

- live Bridge and Swap demo paths;
- passing integration-boundary tests;
- public transaction or receipt examples with sensitive values removed; and
- updated architecture and operator documentation.

**Circle/Arc dependency:** Arc Mainnet, native USDC, Circle App Kit Bridge,
Circle App Kit Swap and the Circle viem adapter.

### Milestone 2 — Gateway-aware agent payment rail

**Window:** Weeks 4–7

**Deliverables**

- integrate Circle Gateway balance visibility for supported domains;
- add an allowlisted Gateway-backed payment path for eligible Agent Research
  calls while preserving the existing exact-quote validation boundary;
- keep per-call, rolling 24-hour, expiry, recipient, asset and network limits
  enforced before any wallet authorization;
- record a canonical receipt containing the quote, authorization, provider
  response and settlement reference; and
- add an emergency disable control and provider health state.

**Acceptance evidence**

- one end-to-end Arc Mainnet research call using the Gateway-enabled path;
- a receipt that independently binds evidence, model, cost and payment state;
- tests proving that over-limit, expired, wrong-recipient and replayed requests
  are rejected; and
- a documented fallback that never silently retries a submitted payment.

**Circle/Arc dependency:** Circle Gateway, native USDC and Arc Mainnet.

### Milestone 3 — Arc-native receipt anchoring

**Window:** Weeks 8–11

**Deliverables**

- deploy a minimal Arc Mainnet contract that anchors versioned batches of
  forecast-settlement and Agent Research receipt hashes;
- keep raw prompts, private session data and user secrets offchain;
- add a public verifier that recomputes a receipt fingerprint and checks its
  inclusion against the Arc anchor;
- verify and publish the contract source, ABI and deployment address; and
- document upgrade, ownership and incident-response boundaries.

**Acceptance evidence**

- verified Arc Mainnet contract deployment;
- unit and integration tests for valid, altered and missing receipt proofs;
- a public receipt page showing both application verification and Arc anchor
  status; and
- no conversion of demo forecast points into a cash-value instrument.

**Circle/Arc dependency:** Arc Mainnet provides the public timestamp and
tamper-evident anchor; native USDC pays predictable deployment and anchor gas.

### Milestone 4 — Production beta and measurable adoption

**Window:** Weeks 12–16

**Deliverables**

- complete an external security review or documented independent threat-model
  review for wallet, payment, agent and receipt boundaries;
- add privacy-preserving product telemetry for completed forecasts, research
  runs, Circle routes and verified receipts;
- publish onboarding material and a short integration demo for Arc builders;
- run a structured beta feedback cycle and resolve high-severity findings; and
- publish a grant completion report with shipped evidence and follow-on work.

**Acceptance evidence and targets**

- at least 100 unique connected wallets during the beta window;
- at least 250 completed forecasting or research sessions;
- at least 25 successful, user-confirmed Circle-powered mainnet actions across
  Bridge, Swap or the eligible research payment path;
- at least 50 publicly verifiable receipts or anchored receipt batches; and
- zero unresolved critical findings at milestone review.

**Circle/Arc dependency:** the beta measures whether Arc and Circle integrations
produce repeatable user activity rather than one-off demonstrations.

## 5. Integration demo path

The grant reviewer can evaluate the current product with the following flow:

1. open `https://www.predarc.xyz` and connect MetaMask or Rabby;
2. switch to Arc Mainnet and sign in with a gas-free wallet signature;
3. open Forecast Arena and record a demo-points forecast;
4. open Bridge and review a small native-USDC route between Arc and a supported
   chain through Circle App Kit;
5. open Swap, request an Arc Mainnet quote for a supported USDC, EURC or cirBTC
   pair and review the wallet-controlled execution step;
6. open Agent Research, run the zero-cost Preview, then inspect its public
   receipt; and
7. optionally request an exact paid-research quote and verify that Predarc checks
   the amount and rolling cap before requesting a one-time authorization.

Reviewers should use small amounts and verify every network, asset, recipient
and amount in the wallet before approving a real-asset action.

## 6. Success metrics

Predarc will report metrics that can be reproduced from privacy-preserving
application and onchain evidence:

- unique connected wallets;
- completed forecast and Community Market sessions;
- Agent Research Preview and paid-call completion rates;
- quote-to-confirmation rates for Circle-powered Bridge and Swap flows;
- rejected unsafe or over-limit agent requests;
- verified and Arc-anchored receipts; and
- retained weekly users during the production beta.

Wallet addresses will not be published as a user leaderboard, and raw assistant
questions, private keys, seed phrases and bearer tokens are never analytics
inputs.

## 7. Security and compliance boundaries

- Predarc is non-custodial; transaction approval stays in the user's wallet.
- The browser cannot choose the authenticated wallet identity used by protected
  server operations.
- Agent permissions and payment permissions remain separate and independently
  revocable.
- A submitted payment is not automatically retried when its result is
  ambiguous.
- Forecasting remains a demo-points experience with no cash value during this
  roadmap.
- Research signals are informational and are not financial advice.
- Any future cash-value forecasting or market structure requires separate legal,
  regulatory, security and product review before implementation.

## 8. Principal risks and mitigations

| Risk | Mitigation |
| --- | --- |
| Provider or route availability changes | Server-side allowlists, visible health state and fail-closed execution |
| Duplicate or ambiguous payment | Idempotency keys, one-time authorization and no automatic resubmission |
| Agent exceeds user intent | Market, duration, confidence, spend, request-count and expiry limits |
| Receipt data is altered | Canonical hashes, immutable database records and Arc anchoring |
| Mainnet user error | Exact amounts, explicit network labels, small-amount guidance and final wallet review |
| Scope expands into regulated activity | Keep forecasting non-cash and require formal review before changing that boundary |

## 9. Post-grant direction

After the 16-week plan, Predarc can expand supported research providers,
additional Circle-supported assets and composable agent workflows only when the
same allowlisting, budget, receipt and revocation guarantees can be preserved.
Adoption data from the production beta will determine which expansion is
justified.
