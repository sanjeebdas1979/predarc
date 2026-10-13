-- Predarc Agent Research Phase 2: opt-in Arc Mainnet x402 exact payments.
-- The browser signs EIP-3009 typed data with the connected wallet. No private
-- key is sent to or stored by Predarc.
begin;

create table if not exists public.predarc_agent_research_paid_quotes (
  id uuid primary key,
  request_id uuid not null,
  chain_id bigint not null,
  wallet text not null,
  input_hash text not null,
  market text not null,
  duration_seconds integer not null,
  model text not null,
  max_cost_atomic numeric(78, 0) not null,
  daily_cost_cap_atomic numeric(78, 0) not null,
  quote_amount_atomic numeric(78, 0) not null,
  scheme text not null,
  network text not null,
  asset text not null,
  pay_to text not null,
  max_timeout_seconds integer not null,
  resource jsonb not null,
  extensions jsonb not null,
  payment_extra jsonb not null,
  authorization_nonce text not null,
  valid_after bigint not null,
  valid_before bigint not null,
  request_body jsonb not null,
  prompt_hash text not null,
  evidence_source text not null,
  evidence_pair text not null,
  evidence_interval text not null,
  evidence_sample_count integer not null,
  evidence_window_start timestamptz not null,
  evidence_window_end timestamptz not null,
  evidence_observed_at timestamptz not null,
  evidence_entry_price text not null,
  evidence_hash text not null,
  metrics jsonb not null,
  status text not null default 'quoted',
  signature_hash text,
  actual_cost_atomic numeric(78, 0) not null default 0,
  error_code text,
  created_at timestamptz not null default clock_timestamp(),
  expires_at timestamptz not null,
  execution_started_at timestamptz,
  completed_at timestamptz,
  constraint predarc_paid_research_quote_identity_key
    unique (chain_id, wallet, request_id),
  constraint predarc_paid_research_quote_chain_check check (chain_id = 5042),
  constraint predarc_paid_research_quote_wallet_check
    check (wallet ~ '^0x[0-9a-f]{40}$'),
  constraint predarc_paid_research_quote_hash_check
    check (input_hash ~ '^[0-9a-f]{64}$' and prompt_hash ~ '^[0-9a-f]{64}$'),
  constraint predarc_paid_research_quote_market_check
    check (market in ('BTC', 'ETH', 'BNB', 'SOL', 'XRP')),
  constraint predarc_paid_research_quote_duration_check
    check (duration_seconds in (60, 300, 900, 3600)),
  constraint predarc_paid_research_quote_model_check
    check (model = 'google/gemini-2.5-flash'),
  constraint predarc_paid_research_quote_budget_check
    check (
      max_cost_atomic between 1 and 50000
      and daily_cost_cap_atomic between max_cost_atomic and 250000
      and quote_amount_atomic between 1 and max_cost_atomic
      and actual_cost_atomic between 0 and quote_amount_atomic
    ),
  constraint predarc_paid_research_quote_payment_check
    check (
      scheme = 'exact'
      and network = 'eip155:5042'
      and asset = '0x3600000000000000000000000000000000000000'
      and pay_to ~ '^0x[0-9a-f]{40}$'
      and pay_to <> '0x0000000000000000000000000000000000000000'
      and max_timeout_seconds between 30 and 300
      and authorization_nonce ~ '^0x[0-9a-f]{64}$'
      and valid_after < valid_before
    ),
  constraint predarc_paid_research_quote_json_check
    check (
      jsonb_typeof(resource) = 'object'
      and resource->>'url' = 'https://arc.blockrun.ai/api/v1/chat/completions'
      and jsonb_typeof(extensions) = 'object'
      and jsonb_typeof(payment_extra) = 'object'
      and payment_extra->>'name' = 'USDC'
      and payment_extra->>'version' = '2'
      and jsonb_typeof(request_body) = 'object'
      and request_body->>'model' = model
    ),
  constraint predarc_paid_research_quote_evidence_check
    check (
      evidence_source = 'Binance public market data'
      and evidence_pair = market || '/USDT'
      and evidence_interval = '1m'
      and evidence_sample_count between 30 and 120
      and evidence_window_start < evidence_window_end
      and evidence_observed_at = evidence_window_end
      and evidence_entry_price ~ '^(0|[1-9][0-9]*)(\.[0-9]{1,18})?$'
      and evidence_hash ~ '^[0-9a-f]{64}$'
      and jsonb_typeof(metrics) = 'object'
    ),
  constraint predarc_paid_research_quote_status_check
    check (status in ('quoted', 'executing', 'completed', 'failed', 'unknown', 'expired')),
  constraint predarc_paid_research_quote_signature_check
    check (signature_hash is null or signature_hash ~ '^[0-9a-f]{64}$'),
  constraint predarc_paid_research_quote_expiry_check
    check (created_at < expires_at)
);

create index if not exists predarc_paid_research_quote_wallet_created_idx
  on public.predarc_agent_research_paid_quotes
  (chain_id, wallet, created_at desc);

create table if not exists public.predarc_agent_research_paid_receipts (
  id uuid primary key,
  quote_id uuid not null unique references public.predarc_agent_research_paid_quotes(id),
  request_id uuid not null,
  chain_id bigint not null,
  wallet text not null,
  market text not null,
  duration_seconds integer not null,
  signal text not null,
  confidence integer not null,
  rationale text not null,
  engine_id text not null,
  engine_version text not null,
  engine_mode text not null,
  provider text not null,
  model text not null,
  evidence_source text not null,
  evidence_pair text not null,
  evidence_interval text not null,
  evidence_sample_count integer not null,
  evidence_window_start timestamptz not null,
  evidence_window_end timestamptz not null,
  evidence_observed_at timestamptz not null,
  evidence_entry_price text not null,
  evidence_hash text not null,
  metrics jsonb not null,
  prompt_hash text not null,
  response_hash text not null,
  authorization_hash text not null unique,
  spending_currency text not null,
  spending_decimals integer not null,
  max_cost_atomic numeric(78, 0) not null,
  daily_cost_cap_atomic numeric(78, 0) not null,
  actual_cost_atomic numeric(78, 0) not null,
  payment_status text not null,
  payment_scheme text not null,
  payment_network text not null,
  payment_asset text not null,
  payment_pay_to text not null,
  payment_reference text not null,
  settlement_transaction text,
  provider_response_id text not null,
  created_at timestamptz not null,
  receipt_hash text not null unique,
  constraint predarc_paid_research_receipt_identity_key
    unique (chain_id, wallet, request_id),
  constraint predarc_paid_research_receipt_chain_check check (chain_id = 5042),
  constraint predarc_paid_research_receipt_wallet_check
    check (wallet ~ '^0x[0-9a-f]{40}$'),
  constraint predarc_paid_research_receipt_market_check
    check (market in ('BTC', 'ETH', 'BNB', 'SOL', 'XRP')),
  constraint predarc_paid_research_receipt_duration_check
    check (duration_seconds in (60, 300, 900, 3600)),
  constraint predarc_paid_research_receipt_result_check
    check (
      signal in ('higher', 'lower', 'neutral')
      and confidence between 50 and 100
      and length(rationale) between 20 and 500
    ),
  constraint predarc_paid_research_receipt_engine_check
    check (
      engine_id = 'predarc-agent-research'
      and engine_version = '2.0.0'
      and engine_mode = 'paid-ai'
      and provider = 'BlockRun'
      and model = 'google/gemini-2.5-flash'
    ),
  constraint predarc_paid_research_receipt_evidence_check
    check (
      evidence_source = 'Binance public market data'
      and evidence_pair = market || '/USDT'
      and evidence_interval = '1m'
      and evidence_sample_count between 30 and 120
      and evidence_window_start < evidence_window_end
      and evidence_observed_at = evidence_window_end
      and evidence_entry_price ~ '^(0|[1-9][0-9]*)(\.[0-9]{1,18})?$'
      and evidence_hash ~ '^[0-9a-f]{64}$'
      and jsonb_typeof(metrics) = 'object'
    ),
  constraint predarc_paid_research_receipt_hash_check
    check (
      prompt_hash ~ '^[0-9a-f]{64}$'
      and response_hash ~ '^[0-9a-f]{64}$'
      and authorization_hash ~ '^[0-9a-f]{64}$'
      and receipt_hash ~ '^[0-9a-f]{64}$'
    ),
  constraint predarc_paid_research_receipt_spending_check
    check (
      spending_currency = 'USDC'
      and spending_decimals = 6
      and max_cost_atomic between 1 and 50000
      and daily_cost_cap_atomic between max_cost_atomic and 250000
      and actual_cost_atomic between 0 and max_cost_atomic
      and payment_status in ('settled', 'not-charged')
      and ((payment_status = 'settled' and actual_cost_atomic > 0)
        or (payment_status = 'not-charged' and actual_cost_atomic = 0))
      and payment_scheme = 'exact'
      and payment_network = 'eip155:5042'
      and payment_asset = '0x3600000000000000000000000000000000000000'
      and payment_pay_to ~ '^0x[0-9a-f]{40}$'
      and payment_reference ~ '^(0x[0-9a-f]{64}|authorization:[0-9a-f]{64})$'
      and (settlement_transaction is null or settlement_transaction ~ '^0x[0-9a-f]{64}$')
    ),
  constraint predarc_paid_research_receipt_provider_check
    check (length(provider_response_id) between 1 and 200)
);

create index if not exists predarc_paid_research_receipt_wallet_created_idx
  on public.predarc_agent_research_paid_receipts
  (chain_id, wallet, created_at desc);

alter table public.predarc_agent_research_paid_quotes enable row level security;
alter table public.predarc_agent_research_paid_receipts enable row level security;

revoke all on public.predarc_agent_research_paid_quotes from anon, authenticated;
revoke all on public.predarc_agent_research_paid_receipts from anon, authenticated;
grant select on public.predarc_agent_research_paid_quotes to service_role;
grant select on public.predarc_agent_research_paid_receipts to service_role;
revoke insert, update, delete on public.predarc_agent_research_paid_quotes from service_role;
revoke insert, update, delete on public.predarc_agent_research_paid_receipts from service_role;

create or replace function public.predarc_create_agent_research_paid_quote_v1(
  p_session_hash text,
  p_id uuid,
  p_request_id uuid,
  p_input_hash text,
  p_market text,
  p_duration_seconds integer,
  p_model text,
  p_max_cost_atomic numeric,
  p_daily_cost_cap_atomic numeric,
  p_quote_amount_atomic numeric,
  p_scheme text,
  p_network text,
  p_asset text,
  p_pay_to text,
  p_max_timeout_seconds integer,
  p_resource jsonb,
  p_extensions jsonb,
  p_payment_extra jsonb,
  p_authorization_nonce text,
  p_valid_after bigint,
  p_valid_before bigint,
  p_request_body jsonb,
  p_prompt_hash text,
  p_evidence_source text,
  p_evidence_pair text,
  p_evidence_interval text,
  p_evidence_sample_count integer,
  p_evidence_window_start timestamptz,
  p_evidence_window_end timestamptz,
  p_evidence_observed_at timestamptz,
  p_evidence_entry_price text,
  p_evidence_hash text,
  p_metrics jsonb,
  p_expires_at timestamptz
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = pg_catalog
as $$
declare
  v_account jsonb;
  v_chain_id bigint;
  v_wallet text;
  v_existing public.predarc_agent_research_paid_quotes%rowtype;
  v_reserved numeric := 0;
  v_count bigint := 0;
  v_now timestamptz := clock_timestamp();
  v_now_epoch bigint := extract(epoch from v_now)::bigint;
begin
  v_account := public.predarc_account_v1(p_session_hash);
  v_chain_id := (v_account->>'chainId')::bigint;
  v_wallet := v_account->>'wallet';
  if v_chain_id <> 5042 then
    raise exception 'PAID_RESEARCH_MAINNET_REQUIRED' using errcode = 'P0001';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_wallet, 5042));
  select q.* into v_existing
  from public.predarc_agent_research_paid_quotes q
  where q.chain_id = v_chain_id and q.wallet = v_wallet and q.request_id = p_request_id
  for update;
  if found then
    if v_existing.input_hash <> p_input_hash then
      raise exception 'PAID_RESEARCH_REQUEST_CONFLICT' using errcode = 'P0001';
    end if;
    raise exception 'PAID_RESEARCH_REQUEST_EXISTS' using errcode = 'P0001';
  end if;

  if p_id is null or p_request_id is null
     or p_input_hash !~ '^[0-9a-f]{64}$'
     or p_market not in ('BTC', 'ETH', 'BNB', 'SOL', 'XRP')
     or p_duration_seconds not in (60, 300, 900, 3600)
     or p_model <> 'google/gemini-2.5-flash'
     or p_max_cost_atomic not between 1 and 50000
     or p_daily_cost_cap_atomic not between p_max_cost_atomic and 250000
     or p_quote_amount_atomic not between 1 and p_max_cost_atomic
     or p_scheme <> 'exact' or p_network <> 'eip155:5042'
     or lower(p_asset) <> '0x3600000000000000000000000000000000000000'
     or lower(p_pay_to) !~ '^0x[0-9a-f]{40}$'
     or lower(p_pay_to) = '0x0000000000000000000000000000000000000000'
     or p_max_timeout_seconds not between 30 and 300
     or jsonb_typeof(p_resource) <> 'object'
     or p_resource->>'url' <> 'https://arc.blockrun.ai/api/v1/chat/completions'
     or jsonb_typeof(p_extensions) <> 'object'
     or jsonb_typeof(p_payment_extra) <> 'object'
     or p_payment_extra->>'name' <> 'USDC'
     or p_payment_extra->>'version' <> '2'
     or p_authorization_nonce !~ '^0x[0-9a-f]{64}$'
     or p_valid_after < v_now_epoch - 660
     or p_valid_after > v_now_epoch
     or p_valid_before < v_now_epoch + 20
     or p_valid_before > v_now_epoch + 300
     or p_valid_after >= p_valid_before
     or jsonb_typeof(p_request_body) <> 'object'
     or p_request_body->>'model' <> p_model
     or p_prompt_hash !~ '^[0-9a-f]{64}$'
     or p_evidence_source <> 'Binance public market data'
     or p_evidence_pair <> p_market || '/USDT'
     or p_evidence_interval <> '1m'
     or p_evidence_sample_count not between 30 and 120
     or p_evidence_window_start >= p_evidence_window_end
     or p_evidence_observed_at <> p_evidence_window_end
     or p_evidence_entry_price !~ '^(0|[1-9][0-9]*)(\.[0-9]{1,18})?$'
     or p_evidence_hash !~ '^[0-9a-f]{64}$'
     or jsonb_typeof(p_metrics) <> 'object'
     or p_expires_at < v_now + interval '20 seconds'
     or p_expires_at > v_now + interval '301 seconds'
  then
    raise exception 'INVALID_PAID_RESEARCH_QUOTE' using errcode = '22023';
  end if;

  update public.predarc_agent_research_paid_quotes
  set status = 'expired', error_code = 'QUOTE_EXPIRED'
  where chain_id = v_chain_id and wallet = v_wallet
    and status = 'quoted' and expires_at <= v_now;

  select count(*), coalesce(sum(
    case when q.status = 'completed' then q.actual_cost_atomic else q.quote_amount_atomic end
  ), 0)
  into v_count, v_reserved
  from public.predarc_agent_research_paid_quotes q
  where q.chain_id = v_chain_id and q.wallet = v_wallet
    and q.created_at >= v_now - interval '24 hours'
    and (q.status in ('executing', 'unknown', 'completed')
      or (q.status = 'quoted' and q.expires_at > v_now));

  if v_count >= 10 then
    raise exception 'PAID_RESEARCH_DAILY_RUN_LIMIT' using errcode = 'P0001';
  end if;
  if v_reserved + p_quote_amount_atomic > p_daily_cost_cap_atomic then
    raise exception 'PAID_RESEARCH_DAILY_SPEND_LIMIT' using errcode = 'P0001';
  end if;

  insert into public.predarc_agent_research_paid_quotes (
    id, request_id, chain_id, wallet, input_hash, market, duration_seconds,
    model, max_cost_atomic, daily_cost_cap_atomic, quote_amount_atomic, scheme,
    network, asset, pay_to, max_timeout_seconds, resource, extensions,
    payment_extra, authorization_nonce, valid_after, valid_before, request_body,
    prompt_hash, evidence_source, evidence_pair, evidence_interval,
    evidence_sample_count, evidence_window_start, evidence_window_end,
    evidence_observed_at, evidence_entry_price, evidence_hash, metrics,
    status, actual_cost_atomic, created_at, expires_at
  ) values (
    p_id, p_request_id, v_chain_id, v_wallet, p_input_hash, p_market,
    p_duration_seconds, p_model, p_max_cost_atomic, p_daily_cost_cap_atomic,
    p_quote_amount_atomic, p_scheme, p_network, lower(p_asset), lower(p_pay_to),
    p_max_timeout_seconds, p_resource, p_extensions, p_payment_extra,
    lower(p_authorization_nonce), p_valid_after, p_valid_before, p_request_body,
    p_prompt_hash, p_evidence_source, p_evidence_pair, p_evidence_interval,
    p_evidence_sample_count, p_evidence_window_start, p_evidence_window_end,
    p_evidence_observed_at, p_evidence_entry_price, p_evidence_hash, p_metrics,
    'quoted', 0, v_now, p_expires_at
  );
  return jsonb_build_object('id', p_id, 'replayed', false);
end;
$$;

create or replace function public.predarc_claim_agent_research_paid_quote_v1(
  p_session_hash text,
  p_quote_id uuid,
  p_signature_hash text
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = pg_catalog
as $$
declare
  v_account jsonb;
  v_quote public.predarc_agent_research_paid_quotes%rowtype;
  v_now timestamptz := clock_timestamp();
begin
  if p_signature_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'INVALID_PAID_RESEARCH_SIGNATURE' using errcode = '22023';
  end if;
  v_account := public.predarc_account_v1(p_session_hash);
  select q.* into v_quote from public.predarc_agent_research_paid_quotes q
  where q.id = p_quote_id
    and q.chain_id = (v_account->>'chainId')::bigint
    and q.wallet = v_account->>'wallet'
  for update;
  if not found then
    raise exception 'PAID_RESEARCH_QUOTE_NOT_FOUND' using errcode = 'P0001';
  end if;
  if v_quote.status <> 'quoted' then
    raise exception 'PAID_RESEARCH_QUOTE_BUSY' using errcode = 'P0001';
  end if;
  if v_quote.expires_at <= v_now or v_quote.valid_before <= extract(epoch from v_now)::bigint then
    update public.predarc_agent_research_paid_quotes
      set status = 'expired', error_code = 'QUOTE_EXPIRED'
      where id = p_quote_id;
    raise exception 'PAID_RESEARCH_QUOTE_EXPIRED' using errcode = 'P0001';
  end if;
  update public.predarc_agent_research_paid_quotes
  set status = 'executing', signature_hash = p_signature_hash,
      execution_started_at = v_now, error_code = null
  where id = p_quote_id;
  return jsonb_build_object('id', p_quote_id, 'status', 'executing');
end;
$$;

create or replace function public.predarc_finish_agent_research_paid_quote_v1(
  p_session_hash text,
  p_quote_id uuid,
  p_status text,
  p_error_code text
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = pg_catalog
as $$
declare
  v_account jsonb;
begin
  if p_status not in ('failed', 'unknown')
     or p_error_code is null or length(p_error_code) not between 3 and 80 then
    raise exception 'INVALID_PAID_RESEARCH_STATUS' using errcode = '22023';
  end if;
  v_account := public.predarc_account_v1(p_session_hash);
  update public.predarc_agent_research_paid_quotes
  set status = p_status, error_code = p_error_code, completed_at = clock_timestamp()
  where id = p_quote_id and status = 'executing'
    and chain_id = (v_account->>'chainId')::bigint
    and wallet = v_account->>'wallet';
  return jsonb_build_object('id', p_quote_id, 'status', p_status);
end;
$$;

create or replace function public.predarc_complete_agent_research_paid_quote_v1(
  p_session_hash text,
  p_quote_id uuid,
  p_receipt_id uuid,
  p_signal text,
  p_confidence integer,
  p_rationale text,
  p_response_hash text,
  p_authorization_hash text,
  p_actual_cost_atomic numeric,
  p_payment_status text,
  p_payment_reference text,
  p_settlement_transaction text,
  p_provider_response_id text,
  p_created_at timestamptz,
  p_receipt_hash text
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = pg_catalog
as $$
declare
  v_account jsonb;
  v_quote public.predarc_agent_research_paid_quotes%rowtype;
  v_now timestamptz := clock_timestamp();
begin
  v_account := public.predarc_account_v1(p_session_hash);
  select q.* into v_quote from public.predarc_agent_research_paid_quotes q
  where q.id = p_quote_id
    and q.chain_id = (v_account->>'chainId')::bigint
    and q.wallet = v_account->>'wallet'
  for update;
  if not found then
    raise exception 'PAID_RESEARCH_QUOTE_NOT_FOUND' using errcode = 'P0001';
  end if;
  if v_quote.status <> 'executing' then
    raise exception 'PAID_RESEARCH_QUOTE_NOT_EXECUTING' using errcode = 'P0001';
  end if;
  if p_receipt_id is null
     or p_signal not in ('higher', 'lower', 'neutral')
     or p_confidence not between 50 and 100
     or length(p_rationale) not between 20 and 500
     or p_response_hash !~ '^[0-9a-f]{64}$'
     or p_authorization_hash !~ '^[0-9a-f]{64}$'
     or p_actual_cost_atomic not between 0 and v_quote.quote_amount_atomic
     or p_payment_status not in ('settled', 'not-charged')
     or (p_payment_status = 'settled' and p_actual_cost_atomic <= 0)
     or (p_payment_status = 'not-charged' and p_actual_cost_atomic <> 0)
     or p_payment_reference !~ '^(0x[0-9a-f]{64}|authorization:[0-9a-f]{64})$'
     or (p_settlement_transaction is not null and p_settlement_transaction !~ '^0x[0-9a-f]{64}$')
     or length(p_provider_response_id) not between 1 and 200
     or p_created_at < v_now - interval '5 minutes'
     or p_created_at > v_now + interval '30 seconds'
     or p_receipt_hash !~ '^[0-9a-f]{64}$'
  then
    raise exception 'INVALID_PAID_RESEARCH_RECEIPT' using errcode = '22023';
  end if;

  insert into public.predarc_agent_research_paid_receipts (
    id, quote_id, request_id, chain_id, wallet, market, duration_seconds,
    signal, confidence, rationale, engine_id, engine_version, engine_mode,
    provider, model, evidence_source, evidence_pair, evidence_interval,
    evidence_sample_count, evidence_window_start, evidence_window_end,
    evidence_observed_at, evidence_entry_price, evidence_hash, metrics,
    prompt_hash, response_hash, authorization_hash, spending_currency,
    spending_decimals, max_cost_atomic, daily_cost_cap_atomic,
    actual_cost_atomic, payment_status, payment_scheme, payment_network,
    payment_asset, payment_pay_to, payment_reference, settlement_transaction,
    provider_response_id, created_at, receipt_hash
  ) values (
    p_receipt_id, v_quote.id, v_quote.request_id, v_quote.chain_id,
    v_quote.wallet, v_quote.market, v_quote.duration_seconds, p_signal,
    p_confidence, p_rationale, 'predarc-agent-research', '2.0.0', 'paid-ai',
    'BlockRun', v_quote.model, v_quote.evidence_source, v_quote.evidence_pair,
    v_quote.evidence_interval, v_quote.evidence_sample_count,
    v_quote.evidence_window_start, v_quote.evidence_window_end,
    v_quote.evidence_observed_at, v_quote.evidence_entry_price,
    v_quote.evidence_hash, v_quote.metrics, v_quote.prompt_hash,
    p_response_hash, p_authorization_hash, 'USDC', 6,
    v_quote.max_cost_atomic, v_quote.daily_cost_cap_atomic,
    p_actual_cost_atomic, p_payment_status, v_quote.scheme, v_quote.network,
    v_quote.asset, v_quote.pay_to, lower(p_payment_reference),
    lower(p_settlement_transaction), p_provider_response_id, p_created_at,
    p_receipt_hash
  );

  update public.predarc_agent_research_paid_quotes
  set status = 'completed', actual_cost_atomic = p_actual_cost_atomic,
      completed_at = v_now, error_code = null
  where id = p_quote_id;
  return jsonb_build_object('id', p_receipt_id, 'status', 'completed');
end;
$$;

revoke all on function public.predarc_create_agent_research_paid_quote_v1(
  text, uuid, uuid, text, text, integer, text, numeric, numeric, numeric,
  text, text, text, text, integer, jsonb, jsonb, jsonb, text, bigint, bigint,
  jsonb, text, text, text, text, integer, timestamptz, timestamptz,
  timestamptz, text, text, jsonb, timestamptz
) from public, anon, authenticated;
grant execute on function public.predarc_create_agent_research_paid_quote_v1(
  text, uuid, uuid, text, text, integer, text, numeric, numeric, numeric,
  text, text, text, text, integer, jsonb, jsonb, jsonb, text, bigint, bigint,
  jsonb, text, text, text, text, integer, timestamptz, timestamptz,
  timestamptz, text, text, jsonb, timestamptz
) to service_role;

revoke all on function public.predarc_claim_agent_research_paid_quote_v1(text, uuid, text)
  from public, anon, authenticated;
grant execute on function public.predarc_claim_agent_research_paid_quote_v1(text, uuid, text)
  to service_role;
revoke all on function public.predarc_finish_agent_research_paid_quote_v1(text, uuid, text, text)
  from public, anon, authenticated;
grant execute on function public.predarc_finish_agent_research_paid_quote_v1(text, uuid, text, text)
  to service_role;
revoke all on function public.predarc_complete_agent_research_paid_quote_v1(
  text, uuid, uuid, text, integer, text, text, text, numeric, text, text,
  text, text, timestamptz, text
) from public, anon, authenticated;
grant execute on function public.predarc_complete_agent_research_paid_quote_v1(
  text, uuid, uuid, text, integer, text, text, text, numeric, text, text,
  text, text, timestamptz, text
) to service_role;

commit;
