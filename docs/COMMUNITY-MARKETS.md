# Predarc Community Markets

Community Markets lets signed-in users create deterministic crypto questions and lets other users enter with server demo points while confirming each entry through the `ForecastRegistryV2` deployment on the selected Predarc network. Arc Mainnet is live; Base Mainnet remains disabled until its separately deployed and verified registry address is configured.

## Supported v1 market

- Assets: `BTC`, `ETH`, `BNB`, `SOL`, `XRP`
- Durations: 5 minutes, 15 minutes, 1 hour
- Question: `Will ASSET close above TARGET USDT?`
- Directions: `higher` or `lower`
- Minimum entry: 10 server demo points
- Market creation: gas-free wallet signature
- Prediction entry: wallet transaction on the selected network
- Result source: finalized Binance 1-minute candle containing the expiry

There is no free-text question or creator-selected result. A tie is `void` and returns the original server points. Winning result points are twice the entry; a losing entry receives no result points. These are demo points with no cash value.

## Security boundaries

- All mutations require the signed-in `predarc_session` cookie.
- API routes validate the configured request origin before reading or writing data.
- A creation signature binds the request ID, wallet, selected chain, asset, target and duration.
- The target must be between 50% and 150% of a fresh Binance spot price.
- A wallet can have at most three live created markets and can create at most five markets per hour.
- The prediction API retrieves the selected-network transaction and receipt server-side. It verifies the RPC chain, sender, chain-specific registry, function, forecast ID, direction, duration, points and encoded target before debiting server points.
- A wallet can enter a market only once. Transaction hashes and onchain forecast IDs cannot be reused.
- Settlement is deterministic. The person pressing the settlement button does not submit or choose a price.
- Point debit, result state and result-point collection are handled in security-definer database functions with idempotency keys.
- Community entries are recorded on the selected network as participation confirmations. Community outcome and demo-point accounting remain in a chain-isolated Predarc server ledger.

## Apply the database migration

After all existing Predarc migrations, run these files in order in the Supabase SQL Editor:

```text
supabase/migrations/202610020001_community_markets.sql
supabase/migrations/202610020002_community_ledger_reference.sql
supabase/migrations/202610280001_base_mainnet.sql
```

The second migration gives every Community Market debit/refund a dedicated
foreign-key reference while preserving the original Arena ledger constraints.
It is also the required repair for databases that applied the first migration
before the Community Market ledger reference was added.

The Base Mainnet migration extends the supported-chain constraints and RPC
validation without mixing Arc and Base rows. Run it after all earlier Predarc
migrations. It does not deploy a Base contract or copy the Arc contract address.

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
4. Select Arc or Base, connect the wallet on that same network, and sign in to Predarc. Base forecasting requires its configured registry deployment.
5. Choose an asset, use the live price or enter an allowed target, choose a duration, and create a market.
6. With another signed-in wallet on the same network, choose Higher or Lower, enter points and confirm the transaction.
7. Confirm the chain-scoped server balance decreases only after the selected-network receipt is verified.
8. Wait until the market and containing Binance minute candle have closed.
9. Press the settlement button. Confirm the displayed outcome and final candle price.
10. If the signed-in prediction is `won` or `void`, collect the result points and confirm the server balance refreshes.

## Operational notes

- The list refreshes every 30 seconds and on window focus.
- Settlement is user-triggered in v1; any signed-in user can trigger the same deterministic result.
- If the selected network confirms but the server record temporarily fails, the current page keeps the confirmed transaction and offers `Retry server record` instead of asking for another wallet transaction.
- Automatic background settlement can be added later without changing the market or prediction data model.
