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
- Circle App Kit Bridge routes from Base to Arc, Ethereum, Arbitrum,
  OP Mainnet, Polygon PoS and Avalanche, with the reverse routes available;
- Circle App Kit Swap assets (`USDC`, `EURC`, `WETH` on Base);
- Agent Research Preview receipts and BlockRun x402 paid calls;
- bounded AI-agent policies and usage;
- official-USDC receipt lookup; and
- Predarc Assistant and the How to Use guide.

## Required Base deployments

Predarc deliberately does not invent or reuse an Arc contract address on Base.
`contracts/ForecastRegistryV2.sol` reproduces the Arc Mainnet registry's
reviewed runtime logic exactly: when compiled with Solidity `0.8.34` and the
optimizer disabled, all 9,057 runtime bytes before Solidity metadata match the
deployed Arc contract. The repository pins that build in the
`base_mainnet` Foundry profile and protects the expected runtime hash in the
Node test suite.

Base still requires its own deployment because the same address on another
chain is not the same contract. Use a dedicated low-balance deployment wallet
or the existing controlled Predarc owner wallet. Never paste its private key in
source, PowerShell history, chat or a `.env` file.

### Base Mainnet deployment (PowerShell)

Install Foundry, fund the deployment address with a small amount of Base ETH,
then import the key into Foundry's encrypted local keystore. The import command
prompts securely:

```powershell
cast wallet import predarc-base-deployer --interactive
$env:FOUNDRY_PROFILE = "base_mainnet"
cast chain-id --rpc-url https://mainnet.base.org
npm run verify:forecast-bytecode
forge test
forge create contracts/ForecastRegistryV2.sol:ForecastRegistryV2 `
  --rpc-url https://mainnet.base.org `
  --account predarc-base-deployer `
  --broadcast
```

The chain-ID command must print `8453`. Record the deployment transaction and
contract address from `forge create`. Before enabling the UI, confirm the
deployer is the owner and the registry is unpaused:

```powershell
$baseRegistry = "0xYOUR_DEPLOYED_CONTRACT"
cast code $baseRegistry --rpc-url https://mainnet.base.org
cast call $baseRegistry "owner()(address)" --rpc-url https://mainnet.base.org
cast call $baseRegistry "paused()(bool)" --rpc-url https://mainnet.base.org
cast call $baseRegistry "totalForecasts()(uint256)" --rpc-url https://mainnet.base.org
```

`cast code` must not return `0x`, `owner()` must be the intended controlled
address, `paused()` must be `false`, and the initial forecast count must be
zero. Verify the source on BaseScan using the same profile and compiler:

```powershell
$env:BASESCAN_API_KEY = "YOUR_BASESCAN_API_KEY"
forge verify-contract $baseRegistry `
  contracts/ForecastRegistryV2.sol:ForecastRegistryV2 `
  --chain-id 8453 `
  --compiler-version 0.8.34 `
  --etherscan-api-key $env:BASESCAN_API_KEY `
  --watch
```

After those checks, set the public address locally and in the production
deployment, then rebuild:

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
remain visibly disabled. Arc Mainnet continues to use its existing deployment
address and behavior.

## Base Builder Code attribution

Register Predarc in Base Dashboard and copy the project's real Builder Code
from **Settings → Project Settings → Builder Code**. Builder Codes are public
identifiers, not credentials. Configure the exact code without inventing a
placeholder:

```env
NEXT_PUBLIC_BASE_BUILDER_CODE=bc_...
```

Predarc encodes it with `ox/erc8021`. Every Base `useSendTransaction` and
`useWriteContract` request receives the ERC-8021 `dataSuffix`; the Circle App
Kit provider used by Bridge and Swap adds the same suffix to Base
`eth_sendTransaction` requests and supplies the optional `dataSuffix`
capability for `wallet_sendCalls`. The helper is chain-gated, so Arc and every
non-Base transaction remain unchanged. An absent code preserves transaction
functionality but produces no Predarc attribution; an invalid configured code
fails the build instead of writing malformed attribution.

After deployment, make one low-value Base transaction, open it in BaseScan and
confirm its input ends in the ERC-8021 marker
`80218021802180218021802180218021`. Decode the suffix or use Base's Builder
Code checker to confirm the registered Predarc code, not only the marker.

## Database migration

Run `supabase/migrations/202610280001_base_mainnet.sql` once in the Supabase SQL
Editor. It adds `8453` to the allowlisted chain constraints, preserves
chain-scoped uniqueness, and validates the distinct Arc and Base BlockRun x402
endpoints and USDC assets.

Then run
`supabase/migrations/202610300001_prediction_round_parity.sql`. Manual Arc and
Base predictions use the same entry-to-close rule on every layer:

- the live Binance price captured when the user submits is the
  ForecastRegistryV2 and Active Prediction entry price;
- the server accepts that entry only after verifying the confirmed Arc or Base
  `submitForecast` transaction and its exact parameters;
- the finalized Binance close is the onchain and server settlement price;
- Higher wins only when the close is above that user's entry;
- Lower wins only when the close is below that user's entry; and
- a winning claim returns `2 × stake` Arena Points exactly once.

The settlement RPC never replaces an accepted prediction's entry with the
candle open or a later ticker quote. It preserves the verified entry and only
adds the finalized close and result. Already-settled or already-claimed records
remain immutable.

## Mainnet verification checklist

1. Apply both Base and prediction-round-parity database migrations and confirm
   each returns successfully.
2. Run the bytecode and contract tests, then deploy and verify the separate
   Base ForecastRegistryV2 before adding its public address.
3. Register Predarc's Base Builder Code and add both public environment
   variables in local and production environments.
4. Test Arc first to confirm no regression, then select Base and test with a
   separate low-value wallet.
5. Verify the Base owner, pause state, submission, resolution, claim and
   ERC-8021 suffix before enabling Base forecasting for all users.
6. Verify session chain IDs, explorer links, USDC address, ETH gas, swap assets,
   x402 typed-data domain and public receipt output.
