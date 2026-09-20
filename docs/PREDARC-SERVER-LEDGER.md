# Predarc Server Ledger Handoff

Predarc now has a local Arc Testnet server-ledger prototype. Supabase is the source of truth for wallet sessions, server demo points, prediction records, settlement, reward claims, history, and leaderboard stats.

## Current Branch

- Repository: `https://github.com/sanjeebdas1979/predarc`
- Branch: `feature/daily-access`
- Local folder: `C:\Users\USER\arc-forecast-arena`

## Supabase Tables

Core tables:

- `predarc_auth_challenges`
- `predarc_auth_sessions`
- `predarc_wallets`
- `predarc_predictions`
- `predarc_points_ledger`

Point ledger kinds:

- `initial_grant`: one-time `+1000` server demo points per wallet.
- `prediction_debit`: debits points when a prediction is accepted.
- `refund`: reserved for future use.
- `claim_credit`: credits reward after a settled winning prediction is claimed.

## Supabase RPCs

Run migrations in this order:

1. `supabase/migrations/202609170001_daily_foundation.sql`
2. `supabase/migrations/202609190001_prediction_ledger_rpc.sql`
3. `supabase/migrations/202609200001_prediction_settlement_rpc.sql`
4. `supabase/migrations/202609200002_prediction_claim_rpc.sql`

Backend-only RPCs:

- `predarc_account_v1(p_session_hash)`
- `predarc_submit_prediction_v1(...)`
- `predarc_settle_prediction_v1(...)`
- `predarc_claim_prediction_v1(p_session_hash, p_prediction_id)`

Expected privilege check:

```text
backend_can_execute = true
anon_can_execute = false
user_can_execute = false
```

The browser never calls these RPCs directly. Next.js API routes call them with the server-side Supabase service key.

## Next.js API Routes

Auth/session:

- `POST /api/auth/challenge`
- `POST /api/auth/verify`
- `GET /api/auth/session`
- `POST /api/auth/logout`

Server ledger:

- `POST /api/account`
  - Creates/reads the wallet account.
  - Grants initial `1000` server demo points once per wallet.
- `GET /api/predictions`
  - Returns signed-in wallet server prediction history.
  - Adds `claimed: true/false` from `predarc_points_ledger` claim credits.
- `POST /api/predictions/submit`
  - Fetches Binance price server-side.
  - Calls `predarc_submit_prediction_v1`.
  - Debits points atomically.
- `POST /api/predictions/settle`
  - Fetches Binance price server-side.
  - Calls `predarc_settle_prediction_v1`.
  - Marks prediction as `won`, `lost`, or `void`.
- `POST /api/predictions/claim`
  - Calls `predarc_claim_prediction_v1`.
  - Credits `points * 2` once for settled `won` predictions.

All local server-ledger routes enforce configured local origin and require signed wallet session cookies.

## UI State

Main arena:

- `DemoBalanceCard.tsx`
  - Server Demo Balance is primary.
  - Legacy local balance is shown only as a small note.
- `PredictionPanel.tsx`
  - Submits accepted predictions to the server ledger.
  - Refreshes server balance after submit.
- `PredictionHistory.tsx`
  - Server prediction history is primary.
  - Pending closed records can be settled with `Settle server result`.
  - Winning unclaimed records can be claimed with `Claim ... server points`.
  - Legacy local history is collapsed separately.
- `Leaderboard.tsx`
  - Uses server stats when signed in.
  - Falls back to local demo stats when signed out.
- `CommunityLeaderboard.tsx`
  - The `You` row uses server balance and server win/loss stats when signed in.
- `useServerPredictionStats.ts`
  - Shared client hook for server balance and prediction stats.

## Local Test Flow

1. Start production server:

```powershell
npm run build
npm run start
```

2. Open:

```text
http://localhost:3000/auth-test
```

3. Connect wallet on Arc Testnet and sign in.

4. Open:

```text
http://localhost:3000/arena
```

5. Click `Check Server Balance` if needed.

6. Submit a prediction from `Make your prediction`.

7. Confirm the server balance decreases by stake amount.

8. After close time passes, go to `Server prediction history` and click `Settle server result`.

9. If result is `WON`, click `Claim ... server points`.

10. Confirm:

- Server Demo Balance increases by reward.
- Leaderboard current balance matches server balance.
- Community leaderboard `You` row matches server balance and server record.
- `Unclaimed Rewards` becomes `0` after all wins are claimed.

## Useful Supabase Checks

Prediction history:

```sql
select id, market, direction, points, status, entry_price, exit_price,
       accepted_at, closes_at, settled_at
from public.predarc_predictions
where wallet = lower('0xAb9109a40A8D499794ff4f82233cC5F0aE82b5CE')
order by accepted_at desc;
```

Ledger balance:

```sql
select wallet, sum(delta) as server_balance
from public.predarc_points_ledger
where wallet = lower('0xAb9109a40A8D499794ff4f82233cC5F0aE82b5CE')
group by wallet;
```

Ledger entries:

```sql
select kind, delta, source_id, created_at
from public.predarc_points_ledger
where wallet = lower('0xAb9109a40A8D499794ff4f82233cC5F0aE82b5CE')
order by created_at desc;
```

## Known Limits Before Production

This is still a local/testnet prototype.

Before public production, add or review:

- Rate limiting on auth, account, submit, settle, and claim routes.
- Stronger price source/oracle strategy beyond live Binance ticker fallback.
- Automated settlement or `Settle all ready` UX.
- Clearer handling of `void` predictions/refunds.
- Dedicated server-ledger tests for submit, settle, claim, replay, wrong wallet, insufficient points, and expired session.
- Production deployment environment checks so service role keys never reach the browser.
- Final decision on how this server ledger connects to future Arc mainnet/onchain receipt and daily access rules.

## Last Clean Milestone

Server-side loop completed:

```text
wallet sign-in -> server balance -> submit prediction -> debit points -> settle result -> claim reward -> leaderboard refresh
```
