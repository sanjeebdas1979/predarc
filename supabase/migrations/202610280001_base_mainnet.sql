-- Add Base Mainnet as a first-class Predarc execution network without changing
-- existing Arc Mainnet identities, balances, markets, agents or receipts.
begin;

-- Foundation deployments used different names for their chain checks. Replace
-- only checks that explicitly reference chain_id on the four network tables.
do $base_chain_checks$
declare
  v_table text;
  v_constraint record;
begin
  foreach v_table in array array[
    'predarc_auth_sessions',
    'predarc_wallets',
    'predarc_predictions',
    'predarc_points_ledger'
  ] loop
    if to_regclass('public.' || v_table) is null then
      continue;
    end if;
    for v_constraint in
      select c.conname
      from pg_constraint c
      where c.conrelid = to_regclass('public.' || v_table)
        and c.contype = 'c'
        and pg_get_constraintdef(c.oid) ilike '%chain_id%'
    loop
      execute format(
        'alter table public.%I drop constraint %I',
        v_table,
        v_constraint.conname
      );
    end loop;
    execute format(
      'alter table public.%I add constraint %I check (chain_id in (5042002, 5042, 8453))',
      v_table,
      v_table || '_supported_chain_check'
    );
  end loop;
end
$base_chain_checks$;

alter table public.predarc_agent_challenges
  drop constraint if exists predarc_agent_challenge_chain_check;
alter table public.predarc_agent_challenges
  add constraint predarc_agent_challenge_chain_check
  check (chain_id in (5042002, 5042, 8453));

alter table public.predarc_agent_connections
  drop constraint if exists predarc_agent_connection_chain_check;
alter table public.predarc_agent_connections
  add constraint predarc_agent_connection_chain_check
  check (chain_id in (5042002, 5042, 8453));

alter table public.predarc_agent_research_receipts
  drop constraint if exists predarc_agent_research_chain_check;
alter table public.predarc_agent_research_receipts
  add constraint predarc_agent_research_chain_check
  check (chain_id in (5042002, 5042, 8453));

alter table public.predarc_agent_research_paid_quotes
  drop constraint if exists predarc_paid_research_quote_chain_check,
  drop constraint if exists predarc_paid_research_quote_payment_check,
  drop constraint if exists predarc_paid_research_quote_json_check;
alter table public.predarc_agent_research_paid_quotes
  add constraint predarc_paid_research_quote_chain_check
    check (chain_id in (5042, 8453)),
  add constraint predarc_paid_research_quote_payment_check
    check (
      scheme = 'exact'
      and (
        (
          chain_id = 5042
          and network = 'eip155:5042'
          and asset = '0x3600000000000000000000000000000000000000'
        )
        or
        (
          chain_id = 8453
          and network = 'eip155:8453'
          and asset = '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913'
        )
      )
      and pay_to ~ '^0x[0-9a-f]{40}$'
      and pay_to <> '0x0000000000000000000000000000000000000000'
      and max_timeout_seconds between 30 and 300
      and authorization_nonce ~ '^0x[0-9a-f]{64}$'
      and valid_after < valid_before
    ),
  add constraint predarc_paid_research_quote_json_check
    check (
      jsonb_typeof(resource) = 'object'
      and (
        (
          chain_id = 5042
          and resource->>'url' = 'https://arc.blockrun.ai/api/v1/chat/completions'
          and payment_extra->>'name' = 'USDC'
        )
        or
        (
          chain_id = 8453
          and resource->>'url' = 'https://blockrun.ai/api/v1/chat/completions'
          and payment_extra->>'name' = 'USD Coin'
        )
      )
      and jsonb_typeof(extensions) = 'object'
      and jsonb_typeof(payment_extra) = 'object'
      and payment_extra->>'version' = '2'
      and jsonb_typeof(request_body) = 'object'
      and request_body->>'model' = model
    );

alter table public.predarc_agent_research_paid_receipts
  drop constraint if exists predarc_paid_research_receipt_chain_check,
  drop constraint if exists predarc_paid_research_receipt_spending_check;
alter table public.predarc_agent_research_paid_receipts
  add constraint predarc_paid_research_receipt_chain_check
    check (chain_id in (5042, 8453)),
  add constraint predarc_paid_research_receipt_spending_check
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
      and (
        (
          chain_id = 5042
          and payment_network = 'eip155:5042'
          and payment_asset = '0x3600000000000000000000000000000000000000'
        )
        or
        (
          chain_id = 8453
          and payment_network = 'eip155:8453'
          and payment_asset = '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913'
        )
      )
      and payment_pay_to ~ '^0x[0-9a-f]{40}$'
      and payment_reference ~ '^(0x[0-9a-f]{64}|authorization:[0-9a-f]{64})$'
      and (settlement_transaction is null
        or settlement_transaction ~ '^0x[0-9a-f]{64}$')
    );

create or replace function public.predarc_account_v1(p_session_hash text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = pg_catalog
as $$
declare
  v_session public.predarc_auth_sessions%rowtype;
  v_balance numeric;
  v_chain_id bigint;
begin
  if current_setting('transaction_isolation') <> 'read committed' then
    raise exception 'READ_COMMITTED_REQUIRED' using errcode = '25000';
  end if;
  if p_session_hash is null or p_session_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'AUTH_REQUIRED' using errcode = '28000';
  end if;

  select s.* into v_session
  from public.predarc_auth_sessions s
  where s.token_hash = p_session_hash
    and s.chain_id in (5042002, 5042, 8453)
  for share;
  if not found or v_session.expires_at <= clock_timestamp() then
    raise exception 'AUTH_REQUIRED' using errcode = '28000';
  end if;

  v_chain_id := v_session.chain_id;
  insert into public.predarc_wallets (chain_id, wallet)
  values (v_chain_id, v_session.wallet)
  on conflict (chain_id, wallet) do nothing;

  perform 1 from public.predarc_wallets w
  where w.chain_id = v_chain_id and w.wallet = v_session.wallet
  for update;
  if v_session.expires_at <= clock_timestamp() then
    raise exception 'AUTH_REQUIRED' using errcode = '28000';
  end if;

  insert into public.predarc_points_ledger
    (chain_id, wallet, kind, delta, source_id)
  values
    (v_chain_id, v_session.wallet, 'initial_grant', 1000,
     'initial:' || v_session.wallet)
  on conflict (chain_id, wallet) where kind = 'initial_grant' do nothing;

  select coalesce(sum(l.delta), 0) into v_balance
  from public.predarc_points_ledger l
  where l.chain_id = v_chain_id and l.wallet = v_session.wallet;

  return jsonb_build_object(
    'chainId', v_chain_id,
    'wallet', v_session.wallet,
    'balance', v_balance::text,
    'sessionExpiresAt', v_session.expires_at
  );
end;
$$;

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
  v_expected_network text;
  v_expected_asset text;
  v_expected_url text;
  v_expected_name text;
  v_existing public.predarc_agent_research_paid_quotes%rowtype;
  v_reserved numeric := 0;
  v_count bigint := 0;
  v_now timestamptz := clock_timestamp();
  v_now_epoch bigint := extract(epoch from v_now)::bigint;
begin
  v_account := public.predarc_account_v1(p_session_hash);
  v_chain_id := (v_account->>'chainId')::bigint;
  v_wallet := v_account->>'wallet';

  if v_chain_id = 5042 then
    v_expected_network := 'eip155:5042';
    v_expected_asset := '0x3600000000000000000000000000000000000000';
    v_expected_url := 'https://arc.blockrun.ai/api/v1/chat/completions';
    v_expected_name := 'USDC';
  elsif v_chain_id = 8453 then
    v_expected_network := 'eip155:8453';
    v_expected_asset := '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913';
    v_expected_url := 'https://blockrun.ai/api/v1/chat/completions';
    v_expected_name := 'USD Coin';
  else
    raise exception 'PAID_RESEARCH_MAINNET_REQUIRED' using errcode = 'P0001';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(v_chain_id::text || ':' || v_wallet, 5042)
  );
  select q.* into v_existing
  from public.predarc_agent_research_paid_quotes q
  where q.chain_id = v_chain_id
    and q.wallet = v_wallet
    and q.request_id = p_request_id
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
     or p_scheme <> 'exact'
     or p_network <> v_expected_network
     or lower(p_asset) <> v_expected_asset
     or lower(p_pay_to) !~ '^0x[0-9a-f]{40}$'
     or lower(p_pay_to) = '0x0000000000000000000000000000000000000000'
     or p_max_timeout_seconds not between 30 and 300
     or jsonb_typeof(p_resource) <> 'object'
     or p_resource->>'url' <> v_expected_url
     or jsonb_typeof(p_extensions) <> 'object'
     or jsonb_typeof(p_payment_extra) <> 'object'
     or p_payment_extra->>'name' <> v_expected_name
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
  where chain_id = v_chain_id
    and wallet = v_wallet
    and status = 'quoted'
    and expires_at <= v_now;

  select count(*), coalesce(sum(
    case when q.status = 'completed'
      then q.actual_cost_atomic else q.quote_amount_atomic end
  ), 0)
  into v_count, v_reserved
  from public.predarc_agent_research_paid_quotes q
  where q.chain_id = v_chain_id
    and q.wallet = v_wallet
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

revoke all on function public.predarc_account_v1(text)
  from public, anon, authenticated;
grant execute on function public.predarc_account_v1(text) to service_role;

notify pgrst, 'reload schema';
commit;
