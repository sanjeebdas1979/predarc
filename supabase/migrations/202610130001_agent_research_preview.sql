-- Predarc Agent Research Phase 1.
-- Stores immutable, tamper-evident preview receipts without spending USDC.
begin;

create table if not exists public.predarc_agent_research_receipts (
  id uuid primary key,
  request_id uuid not null,
  chain_id bigint not null,
  wallet text not null,
  input_hash text not null,
  receipt_hash text not null unique,
  market text not null,
  duration_seconds integer not null,
  signal text not null,
  confidence integer not null,
  rationale text not null,
  engine_id text not null,
  engine_version text not null,
  engine_mode text not null,
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
  spending_currency text not null,
  spending_decimals integer not null,
  max_cost_atomic numeric(78, 0) not null,
  actual_cost_atomic numeric(78, 0) not null,
  payment_status text not null,
  payment_reference text,
  created_at timestamptz not null,
  constraint predarc_agent_research_identity_key
    unique (chain_id, wallet, request_id),
  constraint predarc_agent_research_chain_check
    check (chain_id in (5042, 5042002)),
  constraint predarc_agent_research_wallet_check
    check (wallet ~ '^0x[0-9a-f]{40}$'),
  constraint predarc_agent_research_input_hash_check
    check (input_hash ~ '^[0-9a-f]{64}$'),
  constraint predarc_agent_research_receipt_hash_check
    check (receipt_hash ~ '^[0-9a-f]{64}$'),
  constraint predarc_agent_research_market_check
    check (market in ('BTC', 'ETH', 'BNB', 'SOL', 'XRP')),
  constraint predarc_agent_research_duration_check
    check (duration_seconds in (60, 300, 900, 3600)),
  constraint predarc_agent_research_signal_check
    check (signal in ('higher', 'lower', 'neutral')),
  constraint predarc_agent_research_confidence_check
    check (confidence between 50 and 100),
  constraint predarc_agent_research_rationale_check
    check (length(rationale) between 20 and 500),
  constraint predarc_agent_research_engine_check
    check (
      engine_id = 'predarc-market-evidence'
      and engine_version = '1.0.0'
      and engine_mode = 'deterministic-preview'
    ),
  constraint predarc_agent_research_evidence_check
    check (
      evidence_source = 'Binance public market data'
      and evidence_pair = market || '/USDT'
      and evidence_interval = '1m'
      and evidence_sample_count between 30 and 120
      and evidence_window_start < evidence_window_end
      and evidence_observed_at = evidence_window_end
      and evidence_entry_price ~ '^(0|[1-9][0-9]*)(\.[0-9]{1,18})?$'
      and evidence_hash ~ '^[0-9a-f]{64}$'
    ),
  constraint predarc_agent_research_metrics_check
    check (
      jsonb_typeof(metrics) = 'object'
      and metrics ?& array[
        'horizonReturnBps',
        'fastTrendBps',
        'volatilityBps',
        'rangePositionBps',
        'evidenceScoreBps'
      ]
      and jsonb_typeof(metrics->'horizonReturnBps') = 'number'
      and jsonb_typeof(metrics->'fastTrendBps') = 'number'
      and jsonb_typeof(metrics->'volatilityBps') = 'number'
      and jsonb_typeof(metrics->'rangePositionBps') = 'number'
      and jsonb_typeof(metrics->'evidenceScoreBps') = 'number'
    ),
  constraint predarc_agent_research_spending_check
    check (
      spending_currency = 'USDC'
      and spending_decimals = 6
      and max_cost_atomic between 0 and 250000
      and actual_cost_atomic = 0
      and payment_status = 'not-charged'
      and payment_reference is null
    )
);

create index if not exists predarc_agent_research_wallet_created_idx
  on public.predarc_agent_research_receipts
  (chain_id, wallet, created_at desc);

alter table public.predarc_agent_research_receipts enable row level security;

revoke all on public.predarc_agent_research_receipts
  from anon, authenticated;
grant select, insert on public.predarc_agent_research_receipts
  to service_role;
revoke update, delete on public.predarc_agent_research_receipts
  from service_role;

create or replace function public.predarc_create_agent_research_receipt_v1(
  p_session_hash text,
  p_id uuid,
  p_request_id uuid,
  p_input_hash text,
  p_market text,
  p_duration_seconds integer,
  p_signal text,
  p_confidence integer,
  p_rationale text,
  p_engine_id text,
  p_engine_version text,
  p_engine_mode text,
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
  p_spending_currency text,
  p_spending_decimals integer,
  p_max_cost_atomic numeric,
  p_actual_cost_atomic numeric,
  p_payment_status text,
  p_payment_reference text,
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
  v_chain_id bigint;
  v_wallet text;
  v_existing public.predarc_agent_research_receipts%rowtype;
  v_now timestamptz := clock_timestamp();
begin
  if current_setting('transaction_isolation') <> 'read committed' then
    raise exception 'READ_COMMITTED_REQUIRED' using errcode = '25000';
  end if;

  if p_id is null
     or p_request_id is null
     or p_input_hash is null
     or p_input_hash !~ '^[0-9a-f]{64}$'
     or p_receipt_hash is null
     or p_receipt_hash !~ '^[0-9a-f]{64}$'
     or p_market not in ('BTC', 'ETH', 'BNB', 'SOL', 'XRP')
     or p_duration_seconds not in (60, 300, 900, 3600)
     or p_signal not in ('higher', 'lower', 'neutral')
     or p_confidence not between 50 and 100
     or p_rationale is null
     or length(p_rationale) not between 20 and 500
     or p_engine_id <> 'predarc-market-evidence'
     or p_engine_version <> '1.0.0'
     or p_engine_mode <> 'deterministic-preview'
     or p_evidence_source <> 'Binance public market data'
     or p_evidence_pair <> p_market || '/USDT'
     or p_evidence_interval <> '1m'
     or p_evidence_sample_count not between 30 and 120
     or p_evidence_window_start >= p_evidence_window_end
     or p_evidence_observed_at <> p_evidence_window_end
     or p_evidence_entry_price is null
     or p_evidence_entry_price !~ '^(0|[1-9][0-9]*)(\.[0-9]{1,18})?$'
     or p_evidence_hash is null
     or p_evidence_hash !~ '^[0-9a-f]{64}$'
     or jsonb_typeof(p_metrics) <> 'object'
     or not (p_metrics ?& array[
       'horizonReturnBps',
       'fastTrendBps',
       'volatilityBps',
       'rangePositionBps',
       'evidenceScoreBps'
     ])
     or p_spending_currency <> 'USDC'
     or p_spending_decimals <> 6
     or p_max_cost_atomic not between 0 and 250000
     or p_actual_cost_atomic <> 0
     or p_payment_status <> 'not-charged'
     or p_payment_reference is not null
     or p_created_at < v_now - interval '5 minutes'
     or p_created_at > v_now + interval '30 seconds'
  then
    raise exception 'INVALID_RESEARCH_RECEIPT' using errcode = '22023';
  end if;

  v_account := public.predarc_account_v1(p_session_hash);
  v_chain_id := (v_account->>'chainId')::bigint;
  v_wallet := v_account->>'wallet';

  select r.* into v_existing
  from public.predarc_agent_research_receipts r
  where r.chain_id = v_chain_id
    and r.wallet = v_wallet
    and r.request_id = p_request_id
  for update;

  if found then
    if v_existing.input_hash <> p_input_hash then
      raise exception 'RESEARCH_REQUEST_CONFLICT' using errcode = 'P0001';
    end if;

    return jsonb_build_object(
      'id', v_existing.id,
      'replayed', true,
      'createdAt', v_existing.created_at
    );
  end if;

  if (
    select count(*)
    from public.predarc_agent_research_receipts r
    where r.chain_id = v_chain_id
      and r.wallet = v_wallet
      and r.created_at >= v_now - interval '24 hours'
  ) >= 10 then
    raise exception 'RESEARCH_DAILY_LIMIT' using errcode = 'P0001';
  end if;

  insert into public.predarc_agent_research_receipts (
    id,
    request_id,
    chain_id,
    wallet,
    input_hash,
    receipt_hash,
    market,
    duration_seconds,
    signal,
    confidence,
    rationale,
    engine_id,
    engine_version,
    engine_mode,
    evidence_source,
    evidence_pair,
    evidence_interval,
    evidence_sample_count,
    evidence_window_start,
    evidence_window_end,
    evidence_observed_at,
    evidence_entry_price,
    evidence_hash,
    metrics,
    spending_currency,
    spending_decimals,
    max_cost_atomic,
    actual_cost_atomic,
    payment_status,
    payment_reference,
    created_at
  ) values (
    p_id,
    p_request_id,
    v_chain_id,
    v_wallet,
    p_input_hash,
    p_receipt_hash,
    p_market,
    p_duration_seconds,
    p_signal,
    p_confidence,
    p_rationale,
    p_engine_id,
    p_engine_version,
    p_engine_mode,
    p_evidence_source,
    p_evidence_pair,
    p_evidence_interval,
    p_evidence_sample_count,
    p_evidence_window_start,
    p_evidence_window_end,
    p_evidence_observed_at,
    p_evidence_entry_price,
    p_evidence_hash,
    p_metrics,
    p_spending_currency,
    p_spending_decimals,
    p_max_cost_atomic,
    p_actual_cost_atomic,
    p_payment_status,
    p_payment_reference,
    p_created_at
  );

  return jsonb_build_object(
    'id', p_id,
    'replayed', false,
    'createdAt', p_created_at
  );
end;
$$;

revoke all on function public.predarc_create_agent_research_receipt_v1(
  text,
  uuid,
  uuid,
  text,
  text,
  integer,
  text,
  integer,
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  integer,
  timestamptz,
  timestamptz,
  timestamptz,
  text,
  text,
  jsonb,
  text,
  integer,
  numeric,
  numeric,
  text,
  text,
  timestamptz,
  text
) from public, anon, authenticated;

grant execute on function public.predarc_create_agent_research_receipt_v1(
  text,
  uuid,
  uuid,
  text,
  text,
  integer,
  text,
  integer,
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  integer,
  timestamptz,
  timestamptz,
  timestamptz,
  text,
  text,
  jsonb,
  text,
  integer,
  numeric,
  numeric,
  text,
  text,
  timestamptz,
  text
) to service_role;

commit;
