-- Give Community Market ledger entries a first-class prediction reference.
-- Safe to run after 202610020001_community_markets.sql.
begin;

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

revoke all on function public.predarc_submit_community_prediction_v1(
  text, uuid, uuid, text, bigint, text, text
) from public, anon, authenticated;

revoke all on function public.predarc_claim_community_prediction_v1(
  text, uuid
) from public, anon, authenticated;

grant execute on function public.predarc_submit_community_prediction_v1(
  text, uuid, uuid, text, bigint, text, text
) to service_role;

grant execute on function public.predarc_claim_community_prediction_v1(
  text, uuid
) to service_role;

notify pgrst, 'reload schema';
commit;
