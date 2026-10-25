# Predarc Assistant

Predarc Assistant is the global lower-right chat widget for verified Predarc and Arc product help. It is informational only: it cannot connect a wallet, read balances, request a signature, submit a transaction or act as financial advice.

## Answer paths

1. Common Predarc and Arc questions use deterministic, reviewed answers. They are immediate and do not call an AI model.
2. Other in-scope questions can use Vercel AI Gateway when the project owner explicitly enables it. Before the model call, the server searches the current official Arc documentation index and retrieves the most relevant pages.
3. Unrelated questions are declined, and unsupported details return a transparent cannot-verify response instead of a guess.

Every response can expose only allowlisted Predarc routes and strictly validated `docs.arc.io` pages as source buttons. The model cannot choose or create those links. Model output is rendered as plain text, so it cannot inject HTML or arbitrary links.

## Privacy and safety

- Predarc does not persist chat messages in Supabase.
- The database stores only hashed anonymous quota counters for optional model calls, and removes old counters after three days.
- Secret-like input is blocked in the browser and checked again across the full conversation on the server.
- The assistant never needs a seed phrase, recovery phrase, private key, API key, agent token or wallet credential.
- AI Gateway requests use the no-prompt-training routing filter and `store: false`.
- The endpoint enforces same-origin requests, strict message shape and size limits, an allowlisted model, trusted source links and server-side usage limits.
- There is no automatic model-call retry, preventing an uncertain request from creating duplicate spend.

## Built-in limits

- Maximum 12 conversation messages per request
- Maximum 800 characters per message
- Maximum 5,000 conversation characters
- Maximum 2,000 characters per answer
- Optional AI: 8 calls per minute and 50 calls per UTC calendar day per anonymous browser fingerprint

The Vercel AI Gateway project budget remains the final spend ceiling and should be configured before enabling live AI.

## Database setup

Run this migration once in the production Supabase project:

```text
supabase/migrations/202610250001_predarc_assistant.sql
```

The migration creates `predarc_assistant_usage` and the service-role-only `predarc_consume_assistant_quota_v1` function. No browser role receives table or function access.

## Environment setup

The assistant ships with live AI disabled. Deterministic verified answers work without an AI credential.

After setting an AI Gateway project budget, configure:

```dotenv
PREDARC_ASSISTANT_AI_ENABLED=true
PREDARC_ASSISTANT_MODEL=openai/gpt-5-nano
```

Authentication is server-side only:

- On a Vercel project connected to AI Gateway, the route can use `VERCEL_OIDC_TOKEN`.
- For local development or a project-scoped key, set `AI_GATEWAY_API_KEY` as a server-only secret.
- Never prefix either variable with `NEXT_PUBLIC_`, commit it to Git or paste its value into chat.

The model allowlist contains `openai/gpt-5-nano` and `openai/gpt-5-mini`; `openai/gpt-5-nano` is the default.

If `PREDARC_ASSISTANT_AI_ENABLED` is absent or not exactly `true`, or if neither server credential is available, the endpoint does not call a model. It returns a verified fallback with trusted sources.

## Current grounding

Predarc facts are maintained in `src/lib/predarc-assistant-server.ts` and the reviewed deterministic answers in `src/lib/predarc-assistant-core.ts`. For broader Arc questions, the server fetches the official `https://docs.arc.io/llms.txt` index, ranks its validated Markdown entries against the question, and retrieves up to three relevant `docs.arc.io` pages. The index and pages are cached for one hour, bounded before entering the model context, and treated as reference data rather than instructions. A small fixed official-page fallback is used if the index is temporarily unavailable.

This grounding materially improves coverage, but it is not a promise that every question has a known answer. The assistant must say that it cannot verify a detail when neither reviewed Predarc context nor the retrieved official Arc pages support it. It also cannot verify live balances, transaction state, quotes, prices or network incidents without a dedicated trusted live-data tool.

Whenever a Predarc feature or Arc network detail changes, update the verified context, deterministic answers and tests in the same pull request.

## Verification

Before release:

1. Run `npm test`.
2. Run `npm run build`.
3. Confirm the four suggested questions return verified answers with trusted source buttons while live AI is disabled.
4. Confirm unrelated and secret-like messages are not sent to a model.
5. Confirm “Is Arc Layer 1 or Layer 2?” returns the reviewed Layer-1 answer even while live AI is disabled.
6. After enabling AI, ask non-FAQ Arc questions about contract addresses, EVM differences and App Kit fees. Confirm each answer shows the relevant official documentation page and inspect AI Gateway usage and the project budget.
7. Test keyboard Escape, mobile sizing, internal source navigation and external Arc source links.
