# Predarc Community Markets

Community Markets lets signed-in users create deterministic crypto questions and lets other users enter with server demo points while confirming each entry through `ForecastRegistryV2` on Arc.

## Supported v1 market

- Assets: `BTC`, `ETH`, `BNB`, `SOL`, `XRP`
- Durations: 5 minutes, 15 minutes, 1 hour
- Question: `Will ASSET close above TARGET USDT?`
- Directions: `higher` or `lower`
- Minimum entry: 10 server demo points
- Market creation: gas-free wallet signature
- Prediction entry: Arc wallet transaction
- Result source: finalized Binance 1-minute candle containing the expiry

There is no free-text question or creator-selected result. A tie is `void` and returns the original server points. Winning result points are twice the entry; a losing entry receives no result points. These are demo points with no cash value.

## Security boundaries

- All mutations require the signed-in `predarc_session` cookie.
- API routes validate the configured request origin before reading or writing data.
- A creation signature binds the request ID, wallet, Arc chain, asset, target and duration.
- The target must be between 50% and 150% of a fresh Binance spot price.
- A wallet can have at most three live created markets and can create at most five markets per hour.
- The prediction API retrieves the Arc transaction and receipt server-side. It verifies the sender, contract, function, forecast ID, direction, duration, points and encoded target before debiting server points.
- A wallet can enter a market only once. Transaction hashes and onchain forecast IDs cannot be reused.
- Settlement is deterministic. The person pressing the settlement button does not submit or choose a price.
- Point debit, result state and result-point collection are handled in security-definer database functions with idempotency keys.
- Community entries are recorded on Arc as participation confirmations. Community outcome and demo-point accounting remain in the Predarc server ledger.

## Apply the database migration

After all existing Predarc migrations, run these files in order in the Supabase SQL Editor:

```text
supabase/migrations/202610020001_community_markets.sql
supabase/migrations/202610020002_community_ledger_reference.sql
```

The second migration gives every Community Market debit/refund a dedicated
foreign-key reference while preserving the original Arena ledger constraints.
It is also the required repair for databases that applied the first migration
before the Community Market ledger reference was added.

The migration creates:

- `predarc_community_markets`
- `predarc_community_predictions`
- `predarc_points_ledger.community_prediction_id`
- `predarc_create_community_market_v1`
- `predarc_submit_community_prediction_v1`
- `predarc_settle_community_market_v1`
- `predarc_claim_community_prediction_v1`

Only the Supabase `service_role` can select these tables or execute the RPCs. The browser reaches them only through the Next.js API routes.

## Routes

- `GET /api/community-markets`
- `POST /api/community-markets`
- `GET /api/community-markets/quote?asset=BTC`
- `POST /api/community-markets/:id/predictions`
- `POST /api/community-markets/:id/settle`
- `POST /api/community-markets/predictions/:predictionId/claim`
- `GET /markets`

## End-to-end test

1. Apply the migration.
2. Run `npm test` and `npm run build`.
3. Start Predarc and open `/markets`.
4. Connect the wallet and sign in to Predarc.
5. Choose an asset, use the live price or enter an allowed target, choose a duration, and create a market.
6. With another signed-in wallet, choose Higher or Lower, enter points and confirm the Arc transaction.
7. Confirm the server balance decreases only after the Arc receipt is verified.
8. Wait until the market and containing Binance minute candle have closed.
9. Press the settlement button. Confirm the displayed outcome and final candle price.
10. If the signed-in prediction is `won` or `void`, collect the result points and confirm the server balance refreshes.

## Operational notes

- The list refreshes every 30 seconds and on window focus.
- Settlement is user-triggered in v1; any signed-in user can trigger the same deterministic result.
- If Arc confirms but the server record temporarily fails, the current page keeps the confirmed transaction and offers `Retry server record` instead of asking for another wallet transaction.
- Automatic background settlement can be added later without changing the market or prediction data model.
