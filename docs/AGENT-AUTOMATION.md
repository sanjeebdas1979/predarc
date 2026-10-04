# Predarc AI Agent Automation

Predarc AI Agent Automation is an optional server-points prediction interface.
It does not replace or change the existing wallet-confirmed manual prediction
flow, and it cannot access Bridge, Swap, wallet funds, private keys or seed
phrases.

## User flow

1. Connect a wallet and sign in to Predarc.
2. Open `/agents` and choose allowed markets, durations, points limits, daily
   limits, minimum confidence and an expiry of at most 30 days.
3. Sign the EIP-712 policy message. This is a gas-free signature, not an
   onchain transaction or token approval.
4. Save the API token when it is displayed. Predarc stores only its SHA-256
   hash and cannot display the token again.
5. Configure the external agent to call `POST /api/agents/predictions` with the
   token in an `Authorization: Bearer ...` header.
6. Pause, resume or permanently revoke the connection from `/agents`.

## Prediction request

Each request must use a fresh UUID so a retry is idempotent:

```json
{
  "requestId": "123e4567-e89b-42d3-a456-426614174000",
  "market": "BTC",
  "direction": "higher",
  "points": 25,
  "durationSeconds": 300,
  "confidence": 78,
  "rationale": "Optional short explanation"
}
```

The API obtains its own live Binance entry price. The agent cannot submit a
price. The database atomically checks the token, status, expiry, market,
duration, confidence, per-prediction limit, daily points limit, daily request
limit, wallet balance and active prediction slot before accepting the request.

## Deployment

Run `supabase/migrations/202610040001_agent_automation.sql` in the same Supabase
project used by Predarc, then deploy the application. No new public browser
secret or environment variable is required.

## Token handling

- Put the token only in a server-side secret store or the agent runtime's
  encrypted environment.
- Never commit it, paste it into chat, publish it in logs or ship it in browser
  JavaScript.
- Revoke the connection immediately if the token may have been exposed.
- Create a new connection to rotate a token.
