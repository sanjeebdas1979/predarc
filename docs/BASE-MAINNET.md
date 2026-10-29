# Base Mainnet integration

Predarc treats Arc Mainnet (`5042`) and Base Mainnet (`8453`) as separate
security domains. Selecting Base never redirects a contract call, session,
server-points balance, market, agent policy, research cap or receipt lookup to
Arc.

## Already network-aware

- MetaMask and Rabby selection plus wallet network switching;
- gas-free wallet sessions bound to the selected chain;
- server-ledger balances, Arena history and Community Markets isolated by
  `chain_id`;
- Circle App Kit Bridge routes with the selected network as the default side;
- Circle App Kit Swap assets (`USDC`, `EURC`, `WETH` on Base);
- Agent Research Preview receipts and BlockRun x402 paid calls;
- bounded AI-agent policies and usage;
- official-USDC receipt lookup; and
- Predarc Assistant and the How to Use guide.

## Required Base deployments

Predarc deliberately does not invent or reuse an Arc contract address on Base.
Before enabling Base forecasting, deploy the reviewed `ForecastRegistryV2`
bytecode on chain ID `8453`, verify the source on BaseScan, test owner and pause
controls, and set:

```env
NEXT_PUBLIC_PREDARC_BASE_FORECAST_REGISTRY_ADDRESS=0x...
```

Daily Access is independently optional. If it is deployed and its scorer
service is ready, set both:

```env
NEXT_PUBLIC_PREDARC_BASE_DAILY_ADDRESS=0x...
NEXT_PUBLIC_PREDARC_BASE_DAILY_ENABLED=true
```

Until those values are present, the corresponding Base transaction controls
remain visibly disabled. Arc Mainnet continues to use its existing verified
addresses and behavior.

## Database migration

Run `supabase/migrations/202610280001_base_mainnet.sql` once in the Supabase SQL
Editor. It adds `8453` to the allowlisted chain constraints, preserves
chain-scoped uniqueness, and validates the distinct Arc and Base BlockRun x402
endpoints and USDC assets.

## Mainnet verification checklist

1. Apply the database migration and confirm it returns successfully.
2. Deploy and verify Base contracts before adding their public addresses.
3. Add the new environment variables in local and production environments.
4. Test Arc first to confirm no regression, then select Base and test with a
   separate low-value wallet.
5. Verify session chain IDs, explorer links, USDC address, ETH gas, swap assets,
   x402 typed-data domain and public receipt output before enabling Base for all
   users.
