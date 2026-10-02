-- Signed-wallet community markets with server-priced settlement.
begin;

create table if not exists public.predarc_community_markets (
  id uuid primary key default gen_random_uuid(),
  chain_id bigint not null,
  creator_wallet text not null,
  request_id uuid not null,
  asset text not null check (asset in ('BTC','ETH','BNB','SOL','XRP')),
  target_price numeric(30,12) not null check (
    target_price > 0 and target_price <= 1000000000000
  ),
  reference_price numeric(30,12) not null check (
    reference_price > 0 and reference_price <= 1000000000000
  ),
  duration_seconds integer not null check (
    duration_seconds in (300,900,3600)
  ),
  price_source text not null check (price_source = 'binance'),
  reference_observed_at timestamptz not null,
  created_at timestamptz not null default clock_timestamp(),
  closes_at timestamptz not null,
  status text not null default 'open' check (status in ('open','settled')),
  outcome text check (outcome in ('higher','lower','void')),
  settlement_price numeric(30,12),
  settlement_price_source text,
  settlement_observed_at timestamptz,
  settled_at timestamptz,
  constraint predarc_community_markets_wallet_check
    check (creator_wallet ~ '^0x[0-9a-f]{40}$'),
  constraint predarc_community_markets_close_check
    check (closes_at > created_at),
  constraint predarc_community_markets_request_unique
    unique (chain_id, creator_wallet, request_id)
);

create table if not exists public.predarc_community_predictions (
  id uuid primary key default gen_random_uuid(),
  chain_id bigint not null,
  market_id uuid not null references public.predarc_community_markets(id),
  wallet text not null,
  request_id uuid not null,
  direction text not null check (direction in ('higher','lower')),
  points bigint not null check (points between 10 and 1000000000),
  onchain_forecast_id text not null check (
    onchain_forecast_id ~ '^(0|[1-9][0-9]{0,77})$'
  ),
  transaction_hash text not null check (
    transaction_hash ~ '^0x[0-9a-f]{64}$'
  ),
  status text not null default 'pending' check (
    status in ('pending','won','lost','void')
  ),
  accepted_at timestamptz not null default clock_timestamp(),
  constraint predarc_community_predictions_wallet_check
    check (wallet ~ '^0x[0-9a-f]{40}$'),
  constraint predarc_community_predictions_request_unique
    unique (chain_id, wallet, request_id),
  constraint predarc_community_predictions_wallet_market_unique
    unique (chain_id, wallet, market_id),
  constraint predarc_community_predictions_forecast_unique
    unique (chain_id, onchain_forecast_id),
  constraint predarc_community_predictions_tx_unique
    unique (chain_id, transaction_hash)
);

-- Community ledger rows keep the same wallet/chain referential guarantees as
-- normal Arena predictions without weakening the existing ledger checks.
alter table public.predarc_points_ledger
  add column if not exists community_prediction_id uuid;

create unique index if not exists predarc_community_predictions_identity_key
  on public.predarc_community_predictions (id, chain_id, wallet);

do $$
begin
  if not exists (
    select 1
    from pg_catalog.pg_constraint c
    where c.conrelid = 'public.predarc_points_ledger'::regclass
      and c.conname = 'predarc_ledger_community_prediction_fkey'
  ) then
    alter table public.predarc_points_ledger
      add constraint predarc_ledger_community_prediction_fkey
      foreign key (community_prediction_id, chain_id, wallet)
      references public.predarc_community_predictions (id, chain_id, wallet);
  end if;
end;
$$;

alter table public.predarc_points_ledger
  drop constraint if exists predarc_points_ledger_check;

alter table public.predarc_points_ledger
  add constraint predarc_points_ledger_check check (
    (
      kind = 'prediction_debit'
      and delta < 0
      and (
        (prediction_id is not null and community_prediction_id is null)
        or
        (prediction_id is null and community_prediction_id is not null)
      )
    )
    or
    (
      kind = 'refund'
      and delta > 0
      and (
        (prediction_id is not null and community_prediction_id is null)
        or
        (prediction_id is null and community_prediction_id is not null)
      )
    )
    or
    (
      kind = 'initial_grant'
      and delta > 0
      and prediction_id is null
      and community_prediction_id is null
    )
    or
    (
      kind = 'claim_credit'
      and delta > 0
      and prediction_id is null
    )
  );

create index if not exists predarc_points_ledger_community_prediction_idx
  on public.predarc_points_ledger (community_prediction_id)
  where community_prediction_id is not null;

create index if not exists predarc_community_markets_status_close_idx
  on public.predarc_community_markets (chain_id, status, closes_at);

create index if not exists predarc_community_markets_created_idx
  on public.predarc_community_markets (created_at desc);

create index if not exists predarc_community_predictions_market_idx
  on public.predarc_community_predictions (market_id, accepted_at);

alter table public.predarc_community_markets enable row level security;
alter table public.predarc_community_predictions enable row level security;

revoke all on public.predarc_community_markets,
  public.predarc_community_predictions from anon, authenticated;

grant select on public.predarc_community_markets,
  public.predarc_community_predictions to service_role;

revoke insert, update, delete on public.predarc_community_markets,
  public.predarc_community_predictions from service_role;

create or replace function public.predarc_create_community_market_v1(
  p_session_hash text,
  p_request_id uuid,
  p_asset text,
  p_target_price numeric,
  p_duration_seconds integer,
  p_reference_price numeric,
  p_price_source text,
  p_reference_observed_at timestamptz
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
  v_market public.predarc_community_markets%rowtype;
  v_now timestamptz;
  v_open_count integer;
  v_recent_count integer;
begin
  if p_request_id is null
     or p_asset is null
     or p_asset not in ('BTC','ETH','BNB','SOL','XRP')
     or p_target_price is null
     or p_target_price <= 0
     or p_target_price > 1000000000000
     or p_duration_seconds is null
     or p_duration_seconds not in (300,900,3600)
  then
    raise exception 'INVALID_COMMUNITY_MARKET' using errcode = '22023';
  end if;

  v_account := public.predarc_account_v1(p_session_hash);
  v_chain_id := (v_account->>'chainId')::bigint;
  v_wallet := v_account->>'wallet';

  select m.* into v_market
  from public.predarc_community_markets m
  where m.chain_id = v_chain_id
    and m.creator_wallet = v_wallet
    and m.request_id = p_request_id;

  if found then
    if v_market.asset is distinct from p_asset
       or v_market.target_price is distinct from round(p_target_price, 12)
       or v_market.duration_seconds is distinct from p_duration_seconds
    then
      raise exception 'REQUEST_ID_CONFLICT' using errcode = 'P0001';
    end if;

    return jsonb_build_object('replayed', true, 'market', to_jsonb(v_market));
  end if;

  v_now := clock_timestamp();

  if p_reference_price is null
     or p_reference_price <= 0
     or p_reference_price > 1000000000000
     or p_price_source is distinct from 'binance'
     or p_reference_observed_at is null
     or p_reference_observed_at < v_now - interval '15 seconds'
     or p_reference_observed_at > v_now
     or p_target_price < p_reference_price * 0.5
     or p_target_price > p_reference_price * 1.5
  then
    raise exception 'INVALID_COMMUNITY_TARGET' using errcode = '22023';
  end if;

  select count(*) into v_open_count
  from public.predarc_community_markets m
  where m.chain_id = v_chain_id
    and m.creator_wallet = v_wallet
    and m.status = 'open'
    and m.closes_at > v_now;

  if v_open_count >= 3 then
    raise exception 'COMMUNITY_MARKET_OPEN_LIMIT' using errcode = 'P0001';
  end if;

  select count(*) into v_recent_count
  from public.predarc_community_markets m
  where m.chain_id = v_chain_id
    and m.creator_wallet = v_wallet
    and m.created_at > v_now - interval '1 hour';

  if v_recent_count >= 5 then
    raise exception 'COMMUNITY_MARKET_RATE_LIMIT' using errcode = 'P0001';
  end if;

  insert into public.predarc_community_markets (
    chain_id,
    creator_wallet,
    request_id,
    asset,
    target_price,
    reference_price,
    duration_seconds,
    price_source,
    reference_observed_at,
    created_at,
    closes_at
  ) values (
    v_chain_id,
    v_wallet,
    p_request_id,
    p_asset,
    round(p_target_price, 12),
    round(p_reference_price, 12),
    p_duration_seconds,
    p_price_source,
    p_reference_observed_at,
    v_now,
    v_now + p_duration_seconds * interval '1 second'
  )
  returning * into v_market;

  return jsonb_build_object('replayed', false, 'market', to_jsonb(v_market));
end;
$$;

create or replace function public.predarc_submit_community_prediction_v1(
  p_session_hash text,
  p_request_id uuid,
  p_market_id uuid,
  p_direction text,
  p_points bigint,
  p_onchain_forecast_id text,
  p_transaction_hash text
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
  v_balance numeric;
  v_market public.predarc_community_markets%rowtype;
  v_prediction public.predarc_community_predictions%rowtype;
  v_now timestamptz;
begin
  if p_request_id is null
     or p_market_id is null
     or p_direction is null
     or p_direction not in ('higher','lower')
     or p_points is null
     or p_points < 10
     or p_points > 1000000000
     or p_onchain_forecast_id is null
     or p_onchain_forecast_id !~ '^(0|[1-9][0-9]{0,77})$'
     or p_transaction_hash is null
     or lower(p_transaction_hash) !~ '^0x[0-9a-f]{64}$'
  then
    raise exception 'INVALID_COMMUNITY_PREDICTION' using errcode = '22023';
  end if;

  v_account := public.predarc_account_v1(p_session_hash);
  v_chain_id := (v_account->>'chainId')::bigint;
  v_wallet := v_account->>'wallet';
  v_balance := (v_account->>'balance')::numeric;

  select p.* into v_prediction
  from public.predarc_community_predictions p
  where p.chain_id = v_chain_id
    and p.wallet = v_wallet
    and p.request_id = p_request_id;

  if found then
    if v_prediction.market_id is distinct from p_market_id
       or v_prediction.direction is distinct from p_direction
       or v_prediction.points is distinct from p_points
       or v_prediction.onchain_forecast_id is distinct from p_onchain_forecast_id
       or v_prediction.transaction_hash is distinct from lower(p_transaction_hash)
    then
      raise exception 'REQUEST_ID_CONFLICT' using errcode = 'P0001';
    end if;

    return jsonb_build_object(
      'replayed', true,
      'balance', v_balance::text,
      'prediction', to_jsonb(v_prediction)
    );
  end if;

  select m.* into v_market
  from public.predarc_community_markets m
  where m.id = p_market_id and m.chain_id = v_chain_id
  for update;

  if not found then
    raise exception 'COMMUNITY_MARKET_NOT_FOUND' using errcode = 'P0001';
  end if;

  v_now := clock_timestamp();

  if v_market.status <> 'open' or v_market.closes_at <= v_now then
    raise exception 'COMMUNITY_MARKET_CLOSED' using errcode = 'P0001';
  end if;

  if v_balance < p_points then
    raise exception 'INSUFFICIENT_POINTS' using errcode = 'P0001';
  end if;

  if exists (
    select 1 from public.predarc_community_predictions p
    where p.chain_id = v_chain_id
      and p.wallet = v_wallet
      and p.market_id = p_market_id
  ) then
    raise exception 'COMMUNITY_PREDICTION_EXISTS' using errcode = 'P0001';
  end if;

  insert into public.predarc_community_predictions (
    chain_id,
    market_id,
    wallet,
    request_id,
    direction,
    points,
    onchain_forecast_id,
    transaction_hash,
    status,
    accepted_at
  ) values (
    v_chain_id,
    p_market_id,
    v_wallet,
    p_request_id,
    p_direction,
    p_points,
    p_onchain_forecast_id,
    lower(p_transaction_hash),
    'pending',
    v_now
  )
  returning * into v_prediction;

  insert into public.predarc_points_ledger (
    chain_id,
    wallet,
    kind,
    delta,
    prediction_id,
    community_prediction_id,
    source_id
  ) values (
    v_chain_id,
    v_wallet,
    'prediction_debit',
    -p_points,
    null,
    v_prediction.id,
    'community_prediction:' || v_prediction.id::text
  );

  return jsonb_build_object(
    'replayed', false,
    'balance', (v_balance - p_points)::text,
    'prediction', to_jsonb(v_prediction)
  );
end;
$$;

create or replace function public.predarc_settle_community_market_v1(
  p_session_hash text,
  p_market_id uuid,
  p_exit_price numeric,
  p_price_source text,
  p_exit_observed_at timestamptz
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
  v_market public.predarc_community_markets%rowtype;
  v_outcome text;
begin
  if p_market_id is null then
    raise exception 'INVALID_COMMUNITY_MARKET' using errcode = '22023';
  end if;

  v_account := public.predarc_account_v1(p_session_hash);
  v_chain_id := (v_account->>'chainId')::bigint;

  select m.* into v_market
  from public.predarc_community_markets m
  where m.id = p_market_id and m.chain_id = v_chain_id
  for update;

  if not found then
    raise exception 'COMMUNITY_MARKET_NOT_FOUND' using errcode = 'P0001';
  end if;

  if v_market.status = 'settled' then
    return jsonb_build_object('replayed', true, 'market', to_jsonb(v_market));
  end if;

  if clock_timestamp() < v_market.closes_at then
    raise exception 'COMMUNITY_MARKET_NOT_CLOSED' using errcode = 'P0001';
  end if;

  if p_exit_price is null
     or p_exit_price <= 0
     or p_exit_price > 1000000000000
     or p_price_source is distinct from 'binance_1m_close'
     or p_exit_observed_at is null
     or p_exit_observed_at < v_market.closes_at
     or p_exit_observed_at > v_market.closes_at + interval '60 seconds'
  then
    raise exception 'INVALID_COMMUNITY_SETTLEMENT_PRICE' using errcode = '22023';
  end if;

  v_outcome := case
    when p_exit_price > v_market.target_price then 'higher'
    when p_exit_price < v_market.target_price then 'lower'
    else 'void'
  end;

  update public.predarc_community_markets
  set status = 'settled',
      outcome = v_outcome,
      settlement_price = round(p_exit_price, 12),
      settlement_price_source = p_price_source,
      settlement_observed_at = p_exit_observed_at,
      settled_at = clock_timestamp()
  where id = v_market.id
  returning * into v_market;

  update public.predarc_community_predictions p
  set status = case
    when v_outcome = 'void' then 'void'
    when p.direction = v_outcome then 'won'
    else 'lost'
  end
  where p.market_id = v_market.id and p.status = 'pending';

  return jsonb_build_object('replayed', false, 'market', to_jsonb(v_market));
end;
$$;

create or replace function public.predarc_claim_community_prediction_v1(
  p_session_hash text,
  p_prediction_id uuid
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
  v_prediction public.predarc_community_predictions%rowtype;
  v_reward bigint;
  v_kind text;
  v_source_id text;
  v_balance numeric;
  v_inserted integer;
begin
  if p_prediction_id is null then
    raise exception 'INVALID_COMMUNITY_PREDICTION' using errcode = '22023';
  end if;

  v_account := public.predarc_account_v1(p_session_hash);
  v_chain_id := (v_account->>'chainId')::bigint;
  v_wallet := v_account->>'wallet';

  select p.* into v_prediction
  from public.predarc_community_predictions p
  where p.id = p_prediction_id
    and p.chain_id = v_chain_id
    and p.wallet = v_wallet
  for update;

  if not found then
    raise exception 'COMMUNITY_PREDICTION_NOT_FOUND' using errcode = 'P0001';
  end if;

  if v_prediction.status = 'pending' then
    raise exception 'COMMUNITY_PREDICTION_NOT_SETTLED' using errcode = 'P0001';
  end if;

  if v_prediction.status = 'lost' then
    raise exception 'COMMUNITY_PREDICTION_NOT_WON' using errcode = 'P0001';
  end if;

  if v_prediction.status = 'won' then
    v_reward := v_prediction.points * 2;
    v_kind := 'claim_credit';
    v_source_id := 'community_claim:' || v_prediction.id::text;
  else
    v_reward := v_prediction.points;
    v_kind := 'refund';
    v_source_id := 'community_refund:' || v_prediction.id::text;
  end if;

  insert into public.predarc_points_ledger (
    chain_id,
    wallet,
    kind,
    delta,
    prediction_id,
    community_prediction_id,
    source_id
  ) values (
    v_chain_id,
    v_wallet,
    v_kind,
    v_reward,
    null,
    v_prediction.id,
    v_source_id
  )
  on conflict (chain_id, source_id) do nothing;

  get diagnostics v_inserted = row_count;

  select coalesce(sum(l.delta), 0) into v_balance
  from public.predarc_points_ledger l
  where l.chain_id = v_chain_id and l.wallet = v_wallet;

  return jsonb_build_object(
    'replayed', v_inserted = 0,
    'reward', v_reward::text,
    'balance', v_balance::text,
    'prediction', to_jsonb(v_prediction)
  );
end;
$$;

revoke all on function public.predarc_create_community_market_v1(
  text, uuid, text, numeric, integer, numeric, text, timestamptz
) from public, anon, authenticated;

revoke all on function public.predarc_submit_community_prediction_v1(
  text, uuid, uuid, text, bigint, text, text
) from public, anon, authenticated;

revoke all on function public.predarc_settle_community_market_v1(
  text, uuid, numeric, text, timestamptz
) from public, anon, authenticated;

revoke all on function public.predarc_claim_community_prediction_v1(
  text, uuid
) from public, anon, authenticated;

grant execute on function public.predarc_create_community_market_v1(
  text, uuid, text, numeric, integer, numeric, text, timestamptz
) to service_role;

grant execute on function public.predarc_submit_community_prediction_v1(
  text, uuid, uuid, text, bigint, text, text
) to service_role;

grant execute on function public.predarc_settle_community_market_v1(
  text, uuid, numeric, text, timestamptz
) to service_role;

grant execute on function public.predarc_claim_community_prediction_v1(
  text, uuid
) to service_role;

notify pgrst, 'reload schema';
commit;
