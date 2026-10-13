# Predarc Agent Research

Predarc Agent Research is a separate, opt-in research surface. It does not
change the Arena, Community Markets or existing AI-agent prediction endpoint.

## Phase 1: verifiable Preview

The first phase intentionally avoids paid model calls and automated execution.
An authenticated user selects a supported market, forecast horizon and future
per-run budget cap. Predarc then:

1. loads up to 120 finalized one-minute Binance candles;
2. evaluates momentum, fast trend, volatility and range position with the
   versioned predarc-market-evidence engine;
3. stores an immutable receipt tied to the signed-in wallet and request UUID;
4. hashes the exact evidence snapshot separately;
5. hashes the canonical receipt with SHA-256; and
6. exposes a shareable receipt page and JSON verification endpoint.

The receipt records an actual cost of 0 USDC and a not-charged payment status.
The budget cap inside a Preview receipt remains metadata only; it is not a
token approval and does not initiate a transaction.

## Phase 2: Arc Mainnet paid AI

Paid AI is a separate, explicit path beside Preview. Predarc sends the same
finalized evidence to the allowlisted `google/gemini-2.5-flash` model through
BlockRun's Arc endpoint. The provider first returns an x402 v2 `exact` quote.
Predarc accepts it only when the resource URL, Arc Mainnet network, native USDC
asset, recipient, amount and expiry pass the server allowlist and the user's
limits.

The connected wallet signs USDC `TransferWithAuthorization` typed data. The
private key never leaves the wallet. The server verifies the recovered signer,
submits the signed payment payload once, and records the exact cost, payment
reference, model, evidence hash, prompt hash, response hash and authorization
hash in an immutable receipt.

The current BlockRun Arc quote advertises the x402 `exact` scheme. This phase
therefore does not label the payment as Gateway batching; a batched Gateway
scheme should only be added when the selected provider advertises and supports
that scheme.

## Safety and integrity boundaries

- Browser input never supplies the wallet identity. The server derives it from
  the existing Predarc session.
- Same-origin checks run before protected database access.
- A wallet may create at most 10 receipts in a rolling 24-hour window.
- The chain ID, wallet and request ID form a unique key. Safe retries return the
  original receipt, while reuse with different inputs is rejected.
- Direct browser access to the table is revoked.
- Stored receipts cannot be updated or deleted by the application service role.
- The public receipt route recomputes the canonical SHA-256 fingerprint before
  marking a receipt verified.
- Research does not submit, prefill or automate a prediction.
- Paid calls require Arc Mainnet chain ID 5042 and the fixed Arc USDC contract.
- Per-call cost is capped at 0.05 USDC; the selectable rolling 24-hour cap is
  capped at 0.25 USDC and enforced atomically in the database.
- A quote is one-time, expires within five minutes and can execute only once.
- Ambiguous provider responses are never automatically retried with a new
  authorization, preventing accidental duplicate charges.

## Database setup

Run this migration once in the Supabase SQL Editor:

supabase/migrations/202610130001_agent_research_preview.sql

Then run the Phase 2 migration:

supabase/migrations/202610140001_agent_research_mainnet.sql

No provider private key or API key is required. Paid users authorize each
allowlisted call from their own connected Arc Mainnet wallet.

## Routes

- /research — authenticated research UI and private receipt history
- GET /api/agents/research — signed-in wallet receipt history and usage
- POST /api/agents/research — run the Preview engine and create a receipt
- /research/receipts/[id] — shareable human-readable receipt
- GET /api/agents/research/[id] — public verification JSON
- GET /api/agents/research/paid — signed-in wallet paid receipt history
- POST /api/agents/research/paid/quote — validate and reserve an exact quote
- POST /api/agents/research/paid/execute — verify one-time wallet signature,
  execute the call once and create the paid receipt

## Later work

Additional live-data providers and Gateway batching must remain behind a
server-only allowlist with their own caps. Automated prediction execution stays
a separate, explicit permission with its own pause and revoke controls.
