-- Optional, wallet-authorized AI agent automation for Predarc server points.
-- Manual wallet-confirmed predictions remain unchanged.
begin;

create table if not exists public.predarc_agent_challenges (
  id uuid primary key,
  session_hash text not null,
  chain_id bigint not null,
  wallet text not null,
  policy_hash text not null,
  nonce text not null unique,
  expires_at timestamptz not null,
  consumed_at timestamptz,
  created_at timestamptz not null default clock_timestamp(),
  constraint predarc_agent_challenge_session_check
    check (session_hash ~ '^[0-9a-f]{64}$'),
  constraint predarc_agent_challenge_chain_check
    check (chain_id in (5042, 5042002)),
  constraint predarc_agent_challenge_wallet_check
    check (wallet ~ '^0x[0-9a-f]{40}$'),
  constraint predarc_agent_challenge_policy_check
    check (policy_hash ~ '^[0-9a-f]{64}$'),
  constraint predarc_agent_challenge_nonce_check
    check (nonce ~ '^[0-9a-f]{64}$'),
  constraint predarc_agent_challenge_expiry_check
    check (expires_at > created_at)
);

create table if not exists public.predarc_agent_connections (
  id uuid primary key,
  chain_id bigint not null,
  wallet text not null,
  name text not null,
  token_hash text not null unique,
  policy_hash text not null,
  allowed_markets text[] not null,
  allowed_durations integer[] not null,
  max_points_per_prediction bigint not null,
  max_daily_points bigint not null,
  max_daily_predictions integer not null,
  minimum_confidence integer not null,
  authorization_signature text not null,
  status text not null default 'active',
  expires_at timestamptz not null,
  daily_usage_date date not null
    default (timezone('utc', clock_timestamp())::date),
  daily_points_used bigint not null default 0,
  daily_predictions_used integer not null default 0,
  total_predictions bigint not null default 0,
  last_used_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  constraint predarc_agent_connections_identity_key
    unique (id, chain_id, wallet),
  constraint predarc_agent_connection_chain_check
    check (chain_id in (5042, 5042002)),
  constraint predarc_agent_connection_wallet_check
    check (wallet ~ '^0x[0-9a-f]{40}$'),
  constraint predarc_agent_connection_name_check
    check (length(name) between 2 and 40),
  constraint predarc_agent_connection_token_check
    check (token_hash ~ '^[0-9a-f]{64}$'),
  constraint predarc_agent_connection_policy_check
    check (policy_hash ~ '^[0-9a-f]{64}$'),
  constraint predarc_agent_connection_markets_check
    check (
      cardinality(allowed_markets) between 1 and 5
      and allowed_markets <@ array['BTC','ETH','BNB','SOL','XRP']::text[]
    ),
  constraint predarc_agent_connection_durations_check
    check (
      cardinality(allowed_durations) between 1 and 4
      and allowed_durations <@ array[60,300,900,3600]::integer[]
    ),
  constraint predarc_agent_connection_limits_check
    check (
      max_points_per_prediction between 10 and 1000000
      and max_daily_points between max_points_per_prediction and 10000000
      and max_daily_predictions between 1 and 100
      and minimum_confidence between 50 and 100
    ),
  constraint predarc_agent_connection_signature_check
    check (authorization_signature ~ '^0x[0-9a-fA-F]{130}$'),
  constraint predarc_agent_connection_status_check
    check (status in ('active','paused','revoked')),
  constraint predarc_agent_connection_usage_check
    check (
      daily_points_used >= 0
      and daily_predictions_used >= 0
      and total_predictions >= 0
    ),
  constraint predarc_agent_connection_revoked_check
    check (
      (status = 'revoked' and revoked_at is not null)
      or (status <> 'revoked' and revoked_at is null)
    )
);

alter table public.predarc_predictions
  add column if not exists submission_source text not null default 'wallet',
  add column if not exists agent_connection_id uuid,
  add column if not exists agent_confidence integer,
  add column if not exists agent_rationale text;

alter table public.predarc_predictions
  drop constraint if exists predarc_predictions_submission_source_check;

alter table public.predarc_predictions
  add constraint predarc_predictions_submission_source_check check (
    (
      submission_source = 'wallet'
      and agent_connection_id is null
      and agent_confidence is null
      and agent_rationale is null
    )
    or
    (
      submission_source = 'agent'
      and agent_connection_id is not null
      and agent_confidence between 0 and 100
      and coalesce(length(agent_rationale), 0) <= 500
    )
  );

do $$
begin
  if not exists (
    select 1
    from pg_constraint c
    where c.conrelid = 'public.predarc_predictions'::regclass
      and c.conname = 'predarc_predictions_agent_connection_fkey'
  ) then
    alter table public.predarc_predictions
      add constraint predarc_predictions_agent_connection_fkey
      foreign key (agent_connection_id, chain_id, wallet)
      references public.predarc_agent_connections (id, chain_id, wallet);
  end if;
end;
$$;

create index if not exists predarc_agent_challenges_expiry_idx
  on public.predarc_agent_challenges (expires_at)
  where consumed_at is null;

create index if not exists predarc_agent_connections_wallet_idx
  on public.predarc_agent_connections (chain_id, wallet, created_at desc);

create index if not exists predarc_agent_predictions_activity_idx
  on public.predarc_predictions (agent_connection_id, accepted_at desc)
  where agent_connection_id is not null;

alter table public.predarc_agent_challenges enable row level security;
alter table public.predarc_agent_connections enable row level security;

revoke all on public.predarc_agent_challenges,
  public.predarc_agent_connections from anon, authenticated;

grant select, insert, update, delete on public.predarc_agent_challenges
  to service_role;
grant select on public.predarc_agent_connections to service_role;
revoke insert, update, delete on public.predarc_agent_connections
  from service_role;

create or replace function public.predarc_create_agent_connection_v1(
  p_session_hash text,
  p_challenge_id uuid,
  p_connection_id uuid,
  p_name text,
  p_token_hash text,
  p_allowed_markets text[],
  p_allowed_durations integer[],
  p_max_points_per_prediction bigint,
  p_max_daily_points bigint,
  p_max_daily_predictions integer,
  p_minimum_confidence integer,
  p_expires_at timestamptz,
  p_authorization_signature text,
  p_policy_hash text
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = pg_catalog
as $$
declare
  v_account jsonb;
  v_wallet text;
  v_chain_id bigint;
  v_challenge public.predarc_agent_challenges%rowtype;
  v_connection public.predarc_agent_connections%rowtype;
  v_now timestamptz := clock_timestamp();
begin
  if p_connection_id is null
     or p_challenge_id is null
     or p_name is null
     or length(btrim(p_name)) not between 2 and 40
     or p_token_hash is null
     or p_token_hash !~ '^[0-9a-f]{64}$'
     or p_policy_hash is null
     or p_policy_hash !~ '^[0-9a-f]{64}$'
     or p_allowed_markets is null
     or cardinality(p_allowed_markets) not between 1 and 5
     or not (p_allowed_markets <@ array['BTC','ETH','BNB','SOL','XRP']::text[])
     or p_allowed_durations is null
     or cardinality(p_allowed_durations) not between 1 and 4
     or not (p_allowed_durations <@ array[60,300,900,3600]::integer[])
     or p_max_points_per_prediction not between 10 and 1000000
     or p_max_daily_points not between p_max_points_per_prediction and 10000000
     or p_max_daily_predictions not between 1 and 100
     or p_minimum_confidence not between 50 and 100
     or p_expires_at < v_now + interval '5 minutes'
     or p_expires_at > v_now + interval '30 days'
     or p_authorization_signature !~ '^0x[0-9a-fA-F]{130}$'
  then
    raise exception 'INVALID_AGENT_POLICY' using errcode = '22023';
  end if;

  v_account := public.predarc_account_v1(p_session_hash);
  v_chain_id := (v_account->>'chainId')::bigint;
  v_wallet := v_account->>'wallet';

  select c.* into v_challenge
  from public.predarc_agent_challenges c
  where c.id = p_challenge_id
    and c.session_hash = p_session_hash
    and c.chain_id = v_chain_id
    and c.wallet = v_wallet
    and c.policy_hash = p_policy_hash
  for update;

  if not found
     or v_challenge.consumed_at is not null
     or v_challenge.expires_at <= v_now
  then
    raise exception 'AGENT_CHALLENGE_INVALID' using errcode = 'P0001';
  end if;

  if (
    select count(*)
    from public.predarc_agent_connections c
    where c.chain_id = v_chain_id
      and c.wallet = v_wallet
      and c.status <> 'revoked'
      and c.expires_at > v_now
  ) >= 5 then
    raise exception 'AGENT_CONNECTION_LIMIT' using errcode = 'P0001';
  end if;

  insert into public.predarc_agent_connections (
    id,
    chain_id,
    wallet,
    name,
    token_hash,
    policy_hash,
    allowed_markets,
    allowed_durations,
    max_points_per_prediction,
    max_daily_points,
    max_daily_predictions,
    minimum_confidence,
    authorization_signature,
    expires_at
  ) values (
    p_connection_id,
    v_chain_id,
    v_wallet,
    btrim(p_name),
    p_token_hash,
    p_policy_hash,
    p_allowed_markets,
    p_allowed_durations,
    p_max_points_per_prediction,
    p_max_daily_points,
    p_max_daily_predictions,
    p_minimum_confidence,
    p_authorization_signature,
    p_expires_at
  )
  returning * into v_connection;

  update public.predarc_agent_challenges
  set consumed_at = v_now
  where id = v_challenge.id;

  return jsonb_build_object(
    'id', v_connection.id,
    'name', v_connection.name,
    'status', v_connection.status,
    'expiresAt', v_connection.expires_at,
    'createdAt', v_connection.created_at
  );
end;
$$;

create or replace function public.predarc_set_agent_state_v1(
  p_session_hash text,
  p_connection_id uuid,
  p_action text
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = pg_catalog
as $$
declare
  v_account jsonb;
  v_wallet text;
  v_chain_id bigint;
  v_connection public.predarc_agent_connections%rowtype;
  v_now timestamptz := clock_timestamp();
begin
  if p_connection_id is null
     or p_action not in ('pause','resume','revoke')
  then
    raise exception 'INVALID_AGENT_ACTION' using errcode = '22023';
  end if;

  v_account := public.predarc_account_v1(p_session_hash);
  v_chain_id := (v_account->>'chainId')::bigint;
  v_wallet := v_account->>'wallet';

  select c.* into v_connection
  from public.predarc_agent_connections c
  where c.id = p_connection_id
    and c.chain_id = v_chain_id
    and c.wallet = v_wallet
  for update;

  if not found then
    raise exception 'AGENT_CONNECTION_NOT_FOUND' using errcode = 'P0001';
  end if;

  if p_action = 'revoke' then
    update public.predarc_agent_connections
    set status = 'revoked', revoked_at = v_now, updated_at = v_now
    where id = v_connection.id
    returning * into v_connection;
  elsif p_action = 'pause' then
    if v_connection.status = 'revoked' then
      raise exception 'AGENT_CONNECTION_REVOKED' using errcode = 'P0001';
    end if;

    update public.predarc_agent_connections
    set status = 'paused', updated_at = v_now
    where id = v_connection.id
    returning * into v_connection;
  else
    if v_connection.status = 'revoked' then
      raise exception 'AGENT_CONNECTION_REVOKED' using errcode = 'P0001';
    end if;

    if v_connection.expires_at <= v_now then
      raise exception 'AGENT_CONNECTION_EXPIRED' using errcode = 'P0001';
    end if;

    update public.predarc_agent_connections
    set status = 'active', updated_at = v_now
    where id = v_connection.id
    returning * into v_connection;
  end if;

  return jsonb_build_object(
    'id', v_connection.id,
    'status', v_connection.status
  );
end;
$$;

create or replace function public.predarc_agent_submit_prediction_v1(
  p_token_hash text,
  p_request_id uuid,
  p_market text,
  p_direction text,
  p_points bigint,
  p_duration_seconds integer,
  p_confidence integer,
  p_rationale text,
  p_entry_price numeric,
  p_price_source text,
  p_entry_observed_at timestamptz
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = pg_catalog
as $$
declare
  v_connection public.predarc_agent_connections%rowtype;
  v_prediction public.predarc_predictions%rowtype;
  v_balance numeric;
  v_now timestamptz := clock_timestamp();
  v_today date := timezone('utc', clock_timestamp())::date;
  v_close_at timestamptz;
begin
  if p_token_hash is null
     or p_token_hash !~ '^[0-9a-f]{64}$'
     or p_request_id is null
     or p_market not in ('BTC','ETH','BNB','SOL','XRP')
     or p_direction not in ('higher','lower')
     or p_points not between 10 and 1000000
     or p_duration_seconds not in (60,300,900,3600)
     or p_confidence not between 0 and 100
     or coalesce(length(p_rationale), 0) > 500
  then
    raise exception 'INVALID_AGENT_PREDICTION' using errcode = '22023';
  end if;

  -- Read once to discover the wallet lock, then lock in the same order used by
  -- user controls: wallet first, agent connection second.
  select c.* into v_connection
  from public.predarc_agent_connections c
  where c.token_hash = p_token_hash;

  if not found then
    raise exception 'AGENT_AUTH_REQUIRED' using errcode = '28000';
  end if;

  insert into public.predarc_wallets (chain_id, wallet)
  values (v_connection.chain_id, v_connection.wallet)
  on conflict (chain_id, wallet) do nothing;

  perform 1
  from public.predarc_wallets w
  where w.chain_id = v_connection.chain_id
    and w.wallet = v_connection.wallet
  for update;

  select c.* into v_connection
  from public.predarc_agent_connections c
  where c.token_hash = p_token_hash
  for update;

  if not found
     or v_connection.status <> 'active'
     or v_connection.expires_at <= v_now
  then
    raise exception 'AGENT_NOT_ACTIVE' using errcode = '28000';
  end if;

  if not (p_market = any(v_connection.allowed_markets)) then
    raise exception 'AGENT_MARKET_NOT_ALLOWED' using errcode = 'P0001';
  end if;

  if not (p_duration_seconds = any(v_connection.allowed_durations)) then
    raise exception 'AGENT_DURATION_NOT_ALLOWED' using errcode = 'P0001';
  end if;

  if p_points > v_connection.max_points_per_prediction then
    raise exception 'AGENT_POINTS_LIMIT' using errcode = 'P0001';
  end if;

  if p_confidence < v_connection.minimum_confidence then
    raise exception 'AGENT_CONFIDENCE_TOO_LOW' using errcode = 'P0001';
  end if;

  if v_connection.daily_usage_date <> v_today then
    update public.predarc_agent_connections
    set daily_usage_date = v_today,
        daily_points_used = 0,
        daily_predictions_used = 0,
        updated_at = v_now
    where id = v_connection.id
    returning * into v_connection;
  end if;

  insert into public.predarc_points_ledger
    (chain_id, wallet, kind, delta, source_id)
  values
    (v_connection.chain_id, v_connection.wallet, 'initial_grant', 1000,
     'initial:' || v_connection.wallet)
  on conflict (chain_id, wallet) where kind = 'initial_grant' do nothing;

  select coalesce(sum(l.delta), 0) into v_balance
  from public.predarc_points_ledger l
  where l.chain_id = v_connection.chain_id
    and l.wallet = v_connection.wallet;

  select p.* into v_prediction
  from public.predarc_predictions p
  where p.chain_id = v_connection.chain_id
    and p.wallet = v_connection.wallet
    and p.request_id = p_request_id;

  if found then
    if v_prediction.submission_source is distinct from 'agent'
       or v_prediction.agent_connection_id is distinct from v_connection.id
       or v_prediction.market is distinct from p_market
       or v_prediction.direction is distinct from p_direction
       or v_prediction.points is distinct from p_points
       or v_prediction.duration_seconds is distinct from p_duration_seconds
       or v_prediction.agent_confidence is distinct from p_confidence
    then
      raise exception 'REQUEST_ID_CONFLICT' using errcode = 'P0001';
    end if;

    return jsonb_build_object(
      'replayed', true,
      'balance', v_balance::text,
      'prediction', jsonb_build_object(
        'id', v_prediction.id,
        'market', v_prediction.market,
        'direction', v_prediction.direction,
        'points', v_prediction.points::text,
        'durationSeconds', v_prediction.duration_seconds,
        'acceptedAt', v_prediction.accepted_at,
        'closesAt', v_prediction.closes_at,
        'entryPrice', v_prediction.entry_price::text,
        'confidence', v_prediction.agent_confidence
      )
    );
  end if;

  if v_connection.daily_predictions_used >= v_connection.max_daily_predictions
     or v_connection.daily_points_used + p_points > v_connection.max_daily_points
  then
    raise exception 'AGENT_DAILY_LIMIT' using errcode = 'P0001';
  end if;

  if v_balance < p_points then
    raise exception 'INSUFFICIENT_POINTS' using errcode = 'P0001';
  end if;

  if exists (
    select 1
    from public.predarc_predictions p
    where p.chain_id = v_connection.chain_id
      and p.wallet = v_connection.wallet
      and p.market = p_market
      and p.duration_seconds = p_duration_seconds
      and p.status = 'pending'
  ) then
    raise exception 'PREDICTION_SLOT_ACTIVE' using errcode = 'P0001';
  end if;

  if p_entry_price is null
     or p_entry_price::text in ('NaN','Infinity','-Infinity')
     or p_entry_price <= 0
     or p_entry_price > 1000000000000
     or round(p_entry_price, 12) <= 0
     or p_price_source is distinct from 'binance'
     or p_entry_observed_at is null
     or p_entry_observed_at < v_now - interval '15 seconds'
     or p_entry_observed_at > v_now
  then
    raise exception 'INVALID_OR_STALE_PRICE' using errcode = '22023';
  end if;

  v_close_at := to_timestamp(
    (
      floor(extract(epoch from v_now) / p_duration_seconds)
      + 1
    ) * p_duration_seconds
  );

  insert into public.predarc_predictions (
    chain_id,
    wallet,
    request_id,
    market,
    direction,
    points,
    duration_seconds,
    accepted_at,
    closes_at,
    entry_price,
    price_source,
    entry_observed_at,
    submission_source,
    agent_connection_id,
    agent_confidence,
    agent_rationale
  ) values (
    v_connection.chain_id,
    v_connection.wallet,
    p_request_id,
    p_market,
    p_direction,
    p_points,
    p_duration_seconds,
    v_now,
    v_close_at,
    round(p_entry_price, 12),
    p_price_source,
    p_entry_observed_at,
    'agent',
    v_connection.id,
    p_confidence,
    nullif(p_rationale, '')
  )
  returning * into v_prediction;

  insert into public.predarc_points_ledger (
    chain_id,
    wallet,
    kind,
    delta,
    prediction_id,
    source_id
  ) values (
    v_connection.chain_id,
    v_connection.wallet,
    'prediction_debit',
    -p_points,
    v_prediction.id,
    'prediction:' || v_prediction.id::text
  );

  update public.predarc_agent_connections
  set daily_points_used = daily_points_used + p_points,
      daily_predictions_used = daily_predictions_used + 1,
      total_predictions = total_predictions + 1,
      last_used_at = v_now,
      updated_at = v_now
  where id = v_connection.id;

  return jsonb_build_object(
    'replayed', false,
    'balance', (v_balance - p_points)::text,
    'prediction', jsonb_build_object(
      'id', v_prediction.id,
      'market', v_prediction.market,
      'direction', v_prediction.direction,
      'points', v_prediction.points::text,
      'durationSeconds', v_prediction.duration_seconds,
      'acceptedAt', v_prediction.accepted_at,
      'closesAt', v_prediction.closes_at,
      'entryPrice', v_prediction.entry_price::text,
      'confidence', v_prediction.agent_confidence
    )
  );
end;
$$;

revoke all on function public.predarc_create_agent_connection_v1(
  text, uuid, uuid, text, text, text[], integer[], bigint, bigint,
  integer, integer, timestamptz, text, text
) from public, anon, authenticated;

revoke all on function public.predarc_set_agent_state_v1(
  text, uuid, text
) from public, anon, authenticated;

revoke all on function public.predarc_agent_submit_prediction_v1(
  text, uuid, text, text, bigint, integer, integer, text,
  numeric, text, timestamptz
) from public, anon, authenticated;

grant execute on function public.predarc_create_agent_connection_v1(
  text, uuid, uuid, text, text, text[], integer[], bigint, bigint,
  integer, integer, timestamptz, text, text
) to service_role;

grant execute on function public.predarc_set_agent_state_v1(
  text, uuid, text
) to service_role;

grant execute on function public.predarc_agent_submit_prediction_v1(
  text, uuid, text, text, bigint, integer, integer, text,
  numeric, text, timestamptz
) to service_role;

notify pgrst, 'reload schema';

commit;
