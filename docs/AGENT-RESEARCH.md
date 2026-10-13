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
The budget cap is metadata for the future paid-research phase; it is not a
token approval and does not initiate a transaction.

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

## Database setup

Run this migration once in the Supabase SQL Editor:

supabase/migrations/202610130001_agent_research_preview.sql

No new environment variable is required for Phase 1.

## Routes

- /research — authenticated research UI and private receipt history
- GET /api/agents/research — signed-in wallet receipt history and usage
- POST /api/agents/research — run the Preview engine and create a receipt
- /research/receipts/[id] — shareable human-readable receipt
- GET /api/agents/research/[id] — public verification JSON

## Later phases

Paid AI and live-data providers should be added behind a server-only allowlist.
Circle Gateway authorization, the exact provider/model, actual USDC cost and
payment reference must be bound into a new receipt version. Automated
prediction execution must remain a separate, explicit permission with its own
pause and revoke controls.
