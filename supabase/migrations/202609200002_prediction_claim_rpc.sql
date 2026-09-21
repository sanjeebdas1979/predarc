-- Local Arc Testnet prototype only (chain 5042002).
-- Adds one-time server-side reward claims for settled winning predictions.
begin;

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
begin
  if p_prediction_id is null then
    raise exception 'INVALID_CLAIM' using errcode = '22023';
  end if;

  -- Shares the same wallet-lock protocol as account, submit and settle.
  v_account := public.predarc_account_v1(p_session_hash);
  v_wallet := v_account->>'wallet';

  select p.* into v_prediction
  from public.predarc_predictions p
  where p.id = p_prediction_id
    and p.chain_id = 5042002
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
    5042002, v_wallet, 'claim_credit', v_reward, null,
    'claim:' || v_prediction.id::text
  )
  on conflict (chain_id, source_id) do nothing;

  get diagnostics v_inserted = row_count;

  select coalesce(sum(l.delta), 0) into v_balance
  from public.predarc_points_ledger l
  where l.chain_id = 5042002 and l.wallet = v_wallet;

  return jsonb_build_object(
    'replayed', not v_inserted,
    'reward', v_reward::text,
    'balance', v_balance::text,
    'prediction', to_jsonb(v_prediction)
  );
end;
$$;

revoke all on function public.predarc_claim_prediction_v1(text, uuid)
  from public, anon, authenticated;
grant execute on function public.predarc_claim_prediction_v1(text, uuid)
  to service_role;

notify pgrst, 'reload schema';
commit;

select p.proname as function_name,
  has_function_privilege('service_role', p.oid, 'EXECUTE') as backend_can_execute,
  has_function_privilege('anon', p.oid, 'EXECUTE') as anon_can_execute,
  has_function_privilege('authenticated', p.oid, 'EXECUTE') as user_can_execute
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname = 'predarc_claim_prediction_v1';
