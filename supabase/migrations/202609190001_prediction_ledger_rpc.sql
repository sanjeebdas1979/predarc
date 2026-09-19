-- Local Arc Testnet prototype only (chain 5042002).
-- Requires the foundation tables and predarc_auth_sessions already installed.
-- Backend must hash the HttpOnly session cookie, obtain its own live price,
-- and enforce Origin, rate limits and daily-access eligibility before submission.
-- This migration does not implement daily activation, settlement or claims.
-- Installing it creates no wallets, points or predictions.
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
  where s.token_hash = p_session_hash and s.chain_id = 5042002
  for share;
  if not found or v_session.expires_at <= clock_timestamp() then
    raise exception 'AUTH_REQUIRED' using errcode = '28000';
  end if;

  insert into public.predarc_wallets (chain_id, wallet)
  values (5042002, v_session.wallet)
  on conflict (chain_id, wallet) do nothing;

  -- All future ledger-writing RPCs must take this same wallet lock first.
  perform 1 from public.predarc_wallets w
  where w.chain_id = 5042002 and w.wallet = v_session.wallet
  for update;
  if v_session.expires_at <= clock_timestamp() then
    raise exception 'AUTH_REQUIRED' using errcode = '28000';
  end if;

  -- Once per testnet wallet. Browser-local demo balances are not imported.
  insert into public.predarc_points_ledger
    (chain_id, wallet, kind, delta, source_id)
  values
    (5042002, v_session.wallet, 'initial_grant', 1000,
     'initial:' || v_session.wallet)
  on conflict (chain_id, wallet) where kind = 'initial_grant' do nothing;

  select coalesce(sum(l.delta), 0) into v_balance
  from public.predarc_points_ledger l
  where l.chain_id = 5042002 and l.wallet = v_session.wallet;

  -- Integer balances are strings to avoid JavaScript bigint precision loss.
  return jsonb_build_object(
    'chainId', 5042002, 'wallet', v_session.wallet,
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
  v_prediction public.predarc_predictions%rowtype;
  v_now timestamptz;
begin
  if p_request_id is null
     or p_market is null or p_market not in ('BTC','ETH','BNB','SOL','XRP')
     or p_direction is null or p_direction not in ('higher','lower')
     or p_points is null or p_points < 10 or p_points > 1000000000
     or p_duration_seconds is null or p_duration_seconds not in (60,300,900)
  then
    raise exception 'INVALID_PREDICTION' using errcode = '22023';
  end if;

  -- Nested function shares this transaction; session and wallet locks remain held.
  v_account := public.predarc_account_v1(p_session_hash);
  v_wallet := v_account->>'wallet';
  v_balance := (v_account->>'balance')::numeric;

  select p.* into v_prediction from public.predarc_predictions p
  where p.chain_id = 5042002 and p.wallet = v_wallet
    and p.request_id = p_request_id;
  if found then
    if v_prediction.market is distinct from p_market
       or v_prediction.direction is distinct from p_direction
       or v_prediction.points is distinct from p_points
       or v_prediction.duration_seconds is distinct from p_duration_seconds
    then
      raise exception 'REQUEST_ID_CONFLICT' using errcode = 'P0001';
    end if;
    -- Retry returns the original entry price and deadline, even if the old
    -- quote is stale now. Never reprice or debit an accepted request again.
    return jsonb_build_object('replayed', true,
      'balance', v_balance::text, 'prediction', to_jsonb(v_prediction));
  end if;

  -- Check freshness AFTER waiting for locks, using the actual current time.
  v_now := clock_timestamp();
  if (v_account->>'sessionExpiresAt')::timestamptz <= v_now then
    raise exception 'AUTH_REQUIRED' using errcode = '28000';
  end if;
  if p_entry_price is null or p_entry_price::text in ('NaN','Infinity','-Infinity')
     or p_entry_price <= 0 or p_entry_price > 1000000000000
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

  -- Full 60/300/900 seconds AFTER acceptance, not the browser candle boundary.
  insert into public.predarc_predictions (
    chain_id, wallet, request_id, market, direction, points, duration_seconds,
    accepted_at, closes_at, entry_price, price_source, entry_observed_at
  ) values (
    5042002, v_wallet, p_request_id, p_market, p_direction, p_points,
    p_duration_seconds, v_now, v_now + p_duration_seconds * interval '1 second',
    round(p_entry_price, 12), p_price_source, p_entry_observed_at
  ) returning * into v_prediction;

  insert into public.predarc_points_ledger (
    chain_id, wallet, kind, delta, prediction_id, source_id
  ) values (
    5042002, v_wallet, 'prediction_debit', -p_points,
    v_prediction.id, 'prediction:' || v_prediction.id::text
  );

  -- Any failure rolls back the prediction, debit and any new initial grant.
  return jsonb_build_object('replayed', false,
    'balance', (v_balance - p_points)::text,
    'prediction', to_jsonb(v_prediction));
end;
$$;

-- Never expose these functions to browsers with an anon/publishable key.
revoke all on function public.predarc_account_v1(text)
  from public, anon, authenticated;
revoke all on function public.predarc_submit_prediction_v1(
  text, uuid, text, text, bigint, integer, numeric, text, timestamptz
) from public, anon, authenticated;
grant execute on function public.predarc_account_v1(text) to service_role;
grant execute on function public.predarc_submit_prediction_v1(
  text, uuid, text, text, bigint, integer, numeric, text, timestamptz
) to service_role;

-- Force ordinary backend writes through the locking RPCs. Auth tables retain
-- their existing grants. Future settlement/claim RPCs need this same protocol.
revoke insert, update, delete on public.predarc_wallets,
  public.predarc_predictions, public.predarc_points_ledger from service_role;

notify pgrst, 'reload schema';
commit;

select p.proname as function_name,
  has_function_privilege('service_role', p.oid, 'EXECUTE') as backend_can_execute,
  has_function_privilege('anon', p.oid, 'EXECUTE') as anon_can_execute,
  has_function_privilege('authenticated', p.oid, 'EXECUTE') as user_can_execute
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname in ('predarc_account_v1', 'predarc_submit_prediction_v1')
order by p.proname;
