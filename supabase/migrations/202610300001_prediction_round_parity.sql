-- Preserve each Arc or Base prediction's verified onchain entry price and
-- compare it with the finalized Binance close for that prediction slot.
begin;

drop function if exists public.predarc_settle_prediction_v2(
  text, uuid, numeric, timestamptz, numeric, text, timestamptz
);

create or replace function public.predarc_settle_prediction_v2(
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
     or p_exit_price is null
     or p_exit_price::text in ('NaN','Infinity','-Infinity')
     or p_exit_price <= 0
     or p_exit_price > 1000000000000
     or round(p_exit_price, 12) <= 0
     or p_price_source is distinct from 'binance'
     or p_exit_observed_at is null
  then
    raise exception 'INVALID_SETTLEMENT' using errcode = '22023';
  end if;

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

  if p_exit_observed_at is distinct from v_prediction.closes_at
     or p_exit_observed_at > v_now
  then
    raise exception 'INVALID_SETTLEMENT_TIME' using errcode = '22023';
  end if;

  if p_exit_price = v_prediction.entry_price then
    v_status := 'void';
  elsif (v_prediction.direction = 'higher' and p_exit_price > v_prediction.entry_price)
     or (v_prediction.direction = 'lower' and p_exit_price < v_prediction.entry_price)
  then
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

revoke all on function public.predarc_settle_prediction_v2(
  text, uuid, numeric, text, timestamptz
) from public, anon, authenticated;

grant execute on function public.predarc_settle_prediction_v2(
  text, uuid, numeric, text, timestamptz
) to service_role;

notify pgrst, 'reload schema';

commit;
