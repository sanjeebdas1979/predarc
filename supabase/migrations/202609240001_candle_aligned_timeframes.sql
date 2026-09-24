begin;

alter table public.predarc_predictions
  drop constraint if exists predarc_predictions_duration_seconds_check;

alter table public.predarc_predictions
  add constraint predarc_predictions_duration_seconds_check
  check (duration_seconds in (60, 300, 900, 3600));

alter table public.predarc_predictions
  drop constraint if exists predarc_predictions_closes_at_check;

alter table public.predarc_predictions
  add constraint predarc_predictions_closes_at_check
  check (closes_at > accepted_at);

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
  v_wallet := v_account->>'wallet';
  v_balance := (v_account->>'balance')::numeric;

  select p.*
    into v_prediction
  from public.predarc_predictions p
  where p.chain_id = 5042002
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
    5042002,
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
    5042002,
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

revoke all on function public.predarc_submit_prediction_v1(
  text, uuid, text, text, bigint, integer, numeric, text, timestamptz
) from public, anon, authenticated;

grant execute on function public.predarc_submit_prediction_v1(
  text, uuid, text, text, bigint, integer, numeric, text, timestamptz
) to service_role;

notify pgrst, 'reload schema';

commit;
