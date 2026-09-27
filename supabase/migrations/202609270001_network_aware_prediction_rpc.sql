-- Make prediction RPCs follow the authenticated Arc chain.
begin;

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
  -- The locking protocol below relies on fresh READ COMMITTED snapshots.
  if current_setting('transaction_isolation') <> 'read committed' then
    raise exception 'READ_COMMITTED_REQUIRED' using errcode = '25000';
  end if;
  if p_session_hash is null or p_session_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'AUTH_REQUIRED' using errcode = '28000';
  end if;

  -- Session identity comes from the database, never a submitted wallet address.
  -- Logout either deletes first (this fails) or waits for this transaction.
  select s.* into v_session
  from public.predarc_auth_sessions s
  where s.token_hash = p_session_hash and s.chain_id in (5042002, 5042)
  for share;
  if not found or v_session.expires_at <= clock_timestamp() then
    raise exception 'AUTH_REQUIRED' using errcode = '28000';
  end if;

  v_chain_id := v_session.chain_id;
  if v_chain_id not in (5042002, 5042) then
    raise exception 'UNSUPPORTED_CHAIN' using errcode = '22023';
  end if;



  insert into public.predarc_wallets (chain_id, wallet)
  values (v_chain_id, v_session.wallet)
  on conflict (chain_id, wallet) do nothing;

  -- All future ledger-writing RPCs must take this same wallet lock first.
  perform 1 from public.predarc_wallets w
  where w.chain_id = v_chain_id and w.wallet = v_session.wallet
  for update;
  if v_session.expires_at <= clock_timestamp() then
    raise exception 'AUTH_REQUIRED' using errcode = '28000';
  end if;

  -- Once per testnet wallet. Browser-local demo balances are not imported.
  insert into public.predarc_points_ledger
    (chain_id, wallet, kind, delta, source_id)
  values
    (v_chain_id, v_session.wallet, 'initial_grant', 1000,
     'initial:' || v_session.wallet)
  on conflict (chain_id, wallet) where kind = 'initial_grant' do nothing;

  select coalesce(sum(l.delta), 0) into v_balance
  from public.predarc_points_ledger l
  where l.chain_id = v_chain_id and l.wallet = v_session.wallet;

  -- Integer balances are strings to avoid JavaScript bigint precision loss.
  return jsonb_build_object(
    'chainId', v_chain_id, 'wallet', v_session.wallet,
    'balance', v_balance::text, 'sessionExpiresAt', v_session.expires_at
  );
end;
$$;

create or replace function public.predarc_submit_prediction_v1(
  p_session_hash text,
  p_request_id uuid,
  p_market text,
  p_direction text,
  p_points bigint,
  p_duration_seconds integer,
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
  v_account jsonb;
  v_wallet text;
  v_balance numeric;
  v_chain_id bigint;
  v_prediction public.predarc_predictions%rowtype;
  v_now timestamptz;
  v_close_at timestamptz;
begin
  if p_request_id is null
     or p_market is null
     or p_market not in ('BTC','ETH','BNB','SOL','XRP')
     or p_direction is null
     or p_direction not in ('higher','lower')
     or p_points is null
     or p_points < 10
     or p_points > 1000000000
     or p_duration_seconds is null
     or p_duration_seconds not in (60,300,900,3600)
  then
    raise exception 'INVALID_PREDICTION' using errcode = '22023';
  end if;

  v_account := public.predarc_account_v1(p_session_hash);
  v_chain_id := (v_account->>'chainId')::bigint;
  v_wallet := v_account->>'wallet';
  v_balance := (v_account->>'balance')::numeric;

  select p.*
    into v_prediction
  from public.predarc_predictions p
  where p.chain_id = v_chain_id
    and p.wallet = v_wallet
    and p.request_id = p_request_id;

  if found then
    if v_prediction.market is distinct from p_market
       or v_prediction.direction is distinct from p_direction
       or v_prediction.points is distinct from p_points
       or v_prediction.duration_seconds is distinct from p_duration_seconds
    then
      raise exception 'REQUEST_ID_CONFLICT' using errcode = 'P0001';
    end if;

    return jsonb_build_object(
      'replayed', true,
      'balance', v_balance::text,
      'prediction', to_jsonb(v_prediction)
    );
  end if;

  v_now := clock_timestamp();

  if (v_account->>'sessionExpiresAt')::timestamptz <= v_now then
    raise exception 'AUTH_REQUIRED' using errcode = '28000';
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

  if v_balance < p_points then
    raise exception 'INSUFFICIENT_POINTS' using errcode = 'P0001';
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
    entry_observed_at
  )
  values (
    v_chain_id,
    v_wallet,
    p_request_id,
    p_market,
    p_direction,
    p_points,
    p_duration_seconds,
    v_now,
    v_close_at,
    round(p_entry_price, 12),
    p_price_source,
    p_entry_observed_at
  )
  returning *
    into v_prediction;

  insert into public.predarc_points_ledger (
    chain_id,
    wallet,
    kind,
    delta,
    prediction_id,
    source_id
  )
  values (
    v_chain_id,
    v_wallet,
    'prediction_debit',
    -p_points,
    v_prediction.id,
    'prediction:' || v_prediction.id::text
  );

  return jsonb_build_object(
    'replayed', false,
    'balance', (v_balance - p_points)::text,
    'prediction', to_jsonb(v_prediction)
  );
end;
$$;

create or replace function public.predarc_settle_prediction_v1(
  p_session_hash text,
  p_prediction_id uuid,
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
  v_wallet text;
  v_prediction public.predarc_predictions%rowtype;
  v_now timestamptz;
  v_status text;
  v_chain_id bigint;
begin
  if p_prediction_id is null
     or p_exit_price is null or p_exit_price::text in ('NaN','Infinity','-Infinity')
     or p_exit_price <= 0 or p_exit_price > 1000000000000
     or round(p_exit_price, 12) <= 0
     or p_price_source is distinct from 'binance'
     or p_exit_observed_at is null
  then
    raise exception 'INVALID_SETTLEMENT' using errcode = '22023';
  end if;

  -- Shares the account/session/wallet locking protocol from account_v1.
  v_account := public.predarc_account_v1(p_session_hash);
  v_chain_id := (v_account->>'chainId')::bigint;
  v_wallet := v_account->>'wallet';
  v_now := clock_timestamp();

  select p.* into v_prediction
  from public.predarc_predictions p
  where p.id = p_prediction_id
    and p.chain_id = v_chain_id
    and p.wallet = v_wallet
  for update;

  if not found then
    raise exception 'PREDICTION_NOT_FOUND' using errcode = 'P0002';
  end if;

  if v_prediction.status <> 'pending' then
    return jsonb_build_object(
      'replayed', true,
      'prediction', to_jsonb(v_prediction)
    );
  end if;

  if v_prediction.closes_at > v_now then
    raise exception 'PREDICTION_NOT_CLOSED' using errcode = 'P0001';
  end if;

  if p_exit_observed_at < v_prediction.closes_at
     or p_exit_observed_at > v_now then
    raise exception 'INVALID_SETTLEMENT_TIME' using errcode = '22023';
  end if;

  if p_exit_price = v_prediction.entry_price then
    v_status := 'void';
  elsif (v_prediction.direction = 'higher' and p_exit_price > v_prediction.entry_price)
     or (v_prediction.direction = 'lower' and p_exit_price < v_prediction.entry_price) then
    v_status := 'won';
  else
    v_status := 'lost';
  end if;

  update public.predarc_predictions
  set status = v_status,
      exit_price = round(p_exit_price, 12),
      exit_observed_at = p_exit_observed_at,
      settled_at = v_now
  where id = v_prediction.id
    and chain_id = v_chain_id
    and wallet = v_wallet
  returning * into v_prediction;

  return jsonb_build_object(
    'replayed', false,
    'prediction', to_jsonb(v_prediction)
  );
end;
$$;

create or replace function public.predarc_claim_prediction_v1(
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
  v_wallet text;
  v_prediction public.predarc_predictions%rowtype;
  v_reward bigint;
  v_inserted boolean;
  v_balance numeric;
  v_chain_id bigint;
begin
  if p_prediction_id is null then
    raise exception 'INVALID_CLAIM' using errcode = '22023';
  end if;

  -- Shares the same wallet-lock protocol as account, submit and settle.
  v_account := public.predarc_account_v1(p_session_hash);
  v_chain_id := (v_account->>'chainId')::bigint;
  v_wallet := v_account->>'wallet';

  select p.* into v_prediction
  from public.predarc_predictions p
  where p.id = p_prediction_id
    and p.chain_id = v_chain_id
    and p.wallet = v_wallet
  for update;

  if not found then
    raise exception 'PREDICTION_NOT_FOUND' using errcode = 'P0001';
  end if;

  if v_prediction.status = 'pending' then
    raise exception 'PREDICTION_NOT_SETTLED' using errcode = 'P0001';
  end if;

  if v_prediction.status <> 'won' then
    raise exception 'PREDICTION_NOT_WON' using errcode = 'P0001';
  end if;

  v_reward := v_prediction.points * 2;

  insert into public.predarc_points_ledger (
    chain_id, wallet, kind, delta, prediction_id, source_id
  ) values (
    v_chain_id, v_wallet, 'claim_credit', v_reward, null,
    'claim:' || v_prediction.id::text
  )
  on conflict (chain_id, source_id) do nothing;

  get diagnostics v_inserted = row_count;

  select coalesce(sum(l.delta), 0) into v_balance
  from public.predarc_points_ledger l
  where l.chain_id = v_chain_id and l.wallet = v_wallet;

  return jsonb_build_object(
    'replayed', not v_inserted,
    'reward', v_reward::text,
    'balance', v_balance::text,
    'prediction', to_jsonb(v_prediction)
  );
end;
$$;

notify pgrst, 'reload schema';
commit;
