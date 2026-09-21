# Predarc daily access: implementation draft

Status: contract and dashboard foundation, NOT a complete mainnet migration.
Prepared 2026-09-17 against repository source commit
48533cd8361c560c7effd5edf8ebe0c46f971809, including the earlier receipts draft.
No contract was deployed, no wallet transaction was sent, and the live app was not changed.

## Rules implemented in the new contract

| Action | Rule |
| --- | --- |
| Activate | Successful block timestamp + 86,400 seconds. Early renewal reverts. |
| Claim | All recorded, unclaimed demo points; next successful claim no earlier than 86,400 seconds later. |
| Independent timers | Claim neither renews nor requires activation. Activation never resets claim cooldown. |
| Failure | Reverted/empty calls do not change state or begin timers. |
| Replay | Settlement IDs are globally unique per deployment; already claimed totals cannot be claimed twice. |
| Funds | Nonpayable functions; no USDC transfer, deposit, payout or transferable points token. Network gas still applies. |
| Identity | Limits apply per wallet, not per unique human. Multiple-wallet abuse is not solved. |

The scorer address is immutable and trusted to record legitimate settled demo rewards.
Users cannot submit their own earned-point amounts. A stolen or dishonest scorer key
can fabricate points. This is a centralized demo-points authority, not an oracle-free
prediction protocol. Scorer writes also cost the operator gas, separately from user fees.

## Files and behavior

- `contracts/PredarcDaily.sol`: activation, separate claim clock, cumulative demo reward accounting.
- `contracts/test/PredarcDaily.t.sol`: nine Foundry regression scenarios, no forge-std dependency.
- `src/app/daily/`: `/daily` wallet dashboard, separate countdowns, contract reads, simulation,
  transaction confirmation and explorer links. Wallet fees must be reviewed in wallet.
- `src/lib/daily.ts`: explicit Arc chain definition, contract ABI, configuration.
- `src/lib/daily-core.ts`, `tests/daily.test.mjs`: countdown and UI eligibility projection.
- `src/lib/wagmi.ts`: adds Arc Mainnet; Ethereum `mainnet` remains distinct;
  updates testnet RPC to the documented `.io` endpoint.
- `.env.daily.example`: disabled by default. No hardcoded deployment address.

The existing arena still uses V2 and separate testnet submit/resolve/claim transactions.
Its points/history are retained, but they are NOT automatically migrated to the new
contract. The new activation does NOT yet unlock the old arena. `/daily` clearly says
preview until configured; do not enable it merely because a contract is deployed.
The earlier `/receipts` feature remains testnet-only and is independent of activation.

## Required integration before enabling user transactions

The repository currently keeps forecast state and point balances in browser storage,
and exposes client-selected prices to the existing contract. Reusing these values
as trusted mainnet claim entitlements would permit fabricated rewards.

A durable server prediction service is still required:

1. Authenticate wallet sessions with single-use, expiring, domain/chain-bound signatures.
2. On every forecast submission, read `isActive(wallet)` on the selected chain.
   Enforce the check on the server, not only through UI button state.
3. Store forecasts, market, direction, amount of demo points, server acceptance time,
   duration, entry price and source in a database. Use transactionally enforced
   point debits and unique request IDs. Reject late forecasts and insufficient balances.
4. Obtain entry and settlement prices from a trusted source at defined times; define
   equality, missing-price and outage behavior. Never trust a client-supplied result.
5. Settle each prediction exactly once. Record winning points with `recordPoints`,
   using a persistent globally unique settlement ID. Keep the scorer key server-side.
   Do not publish an unauthenticated endpoint that accepts reward amounts.
6. When indexing successful `PointsClaimed` events, credit the demo ledger exactly once
   using chain + contract + transaction + log index, with reorg/reconciliation handling.
   Do not mark points claimed before a successful receipt or trust a pasted hash.
7. Move PredictionPanel/History to those APIs. This removes per-prediction user
   transactions. Preserve the legacy testnet history separately; use a documented,
   validated snapshot if any old points should migrate. Do not import localStorage blindly.
8. Verify a complete testnet cycle, including wallet switch, reload after pending tx,
   network outage, rejected/reverted transactions, duplicate tabs, independent timers
   and a claim after activation expiry. Then configure a new mainnet deployment.

A dashboard or contract alone cannot safely implement steps 1–7. No fake backend or
client-authoritative replacement is included in this draft.

## Local checks

On a machine with the project dependencies installed:

```sh
npm ci
npx tsc --noEmit
npm run lint
npm run build
node --experimental-strip-types --test tests/daily.test.mjs tests/receipts.test.mjs
forge test
```

Executed in this environment: **15 Node tests passed** (7 new daily UI-rule cases,
8 existing receipt validation cases).

Not executed: Solidity compilation/Foundry tests, full TypeScript check, Next build,
lint, browser/wallet tests or live RPC/contract execution. Dependencies are incomplete;
TypeScript, Next binaries, solc and forge are unavailable. These passing Node tests
are not evidence that the contract or wallet flow works end to end.

Copy `.env.daily.example` values into local environment configuration when ready.
Deploy/test on Arc Testnet first; NEVER reuse the V2 address for the new ABI.
A production address, trusted scorer service, validation gates and gas estimates are
still outstanding. No particular mainnet gas cost is promised.

Official network reference checked: https://docs.arc.io/arc/references/connect-to-arc
Arc Mainnet 5042 / https://rpc.mainnet.arc.io / https://explorer.arc.io
Arc Testnet 5042002 / https://rpc.testnet.arc.io / https://explorer.testnet.arc.io
