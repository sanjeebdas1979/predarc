-- Anonymous, privacy-preserving usage counters for optional Predarc Assistant
-- AI calls. Chat messages are never stored in this table.
begin;

create table if not exists public.predarc_assistant_usage (
  client_hash text not null,
  window_kind text not null,
  window_start timestamptz not null,
  request_count integer not null default 0,
  updated_at timestamptz not null default clock_timestamp(),
  primary key (client_hash, window_kind, window_start),
  constraint predarc_assistant_usage_hash_check
    check (client_hash ~ '^[0-9a-f]{64}$'),
  constraint predarc_assistant_usage_window_check
    check (window_kind in ('minute', 'day')),
  constraint predarc_assistant_usage_count_check
    check (request_count between 0 and 100000)
);

create index if not exists predarc_assistant_usage_updated_idx
  on public.predarc_assistant_usage (updated_at);

alter table public.predarc_assistant_usage enable row level security;
revoke all on public.predarc_assistant_usage from public, anon, authenticated;
revoke all on public.predarc_assistant_usage from service_role;

create or replace function public.predarc_consume_assistant_quota_v1(
  p_client_hash text,
  p_minute_limit integer,
  p_day_limit integer
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = pg_catalog
as $$
declare
  v_now timestamptz := clock_timestamp();
  v_minute_start timestamptz := date_trunc('minute', v_now);
  v_day_start timestamptz := (
    date_trunc('day', v_now at time zone 'UTC') at time zone 'UTC'
  );
  v_minute_count integer := 0;
  v_day_count integer := 0;
  v_retry integer := 60;
begin
  if p_client_hash !~ '^[0-9a-f]{64}$'
     or p_minute_limit not between 1 and 60
     or p_day_limit not between p_minute_limit and 500 then
    raise exception 'INVALID_ASSISTANT_QUOTA_REQUEST' using errcode = '22023';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(p_client_hash, 2501)
  );

  select u.request_count into v_minute_count
  from public.predarc_assistant_usage u
  where u.client_hash = p_client_hash
    and u.window_kind = 'minute'
    and u.window_start = v_minute_start;
  v_minute_count := coalesce(v_minute_count, 0);

  select u.request_count into v_day_count
  from public.predarc_assistant_usage u
  where u.client_hash = p_client_hash
    and u.window_kind = 'day'
    and u.window_start = v_day_start;
  v_day_count := coalesce(v_day_count, 0);

  if v_minute_count >= p_minute_limit then
    v_retry := greatest(1, 60 - extract(second from v_now)::integer);
    return jsonb_build_object(
      'allowed', false,
      'retryAfterSeconds', v_retry,
      'minuteRemaining', 0,
      'dayRemaining', greatest(0, p_day_limit - v_day_count)
    );
  end if;

  if v_day_count >= p_day_limit then
    v_retry := greatest(
      1,
      extract(epoch from ((v_day_start + interval '1 day') - v_now))::integer
    );
    return jsonb_build_object(
      'allowed', false,
      'retryAfterSeconds', v_retry,
      'minuteRemaining', greatest(0, p_minute_limit - v_minute_count),
      'dayRemaining', 0
    );
  end if;

  insert into public.predarc_assistant_usage (
    client_hash, window_kind, window_start, request_count, updated_at
  ) values (
    p_client_hash, 'minute', v_minute_start, 1, v_now
  )
  on conflict (client_hash, window_kind, window_start)
  do update set
    request_count = public.predarc_assistant_usage.request_count + 1,
    updated_at = excluded.updated_at;

  insert into public.predarc_assistant_usage (
    client_hash, window_kind, window_start, request_count, updated_at
  ) values (
    p_client_hash, 'day', v_day_start, 1, v_now
  )
  on conflict (client_hash, window_kind, window_start)
  do update set
    request_count = public.predarc_assistant_usage.request_count + 1,
    updated_at = excluded.updated_at;

  delete from public.predarc_assistant_usage
  where updated_at < v_now - interval '3 days';

  return jsonb_build_object(
    'allowed', true,
    'retryAfterSeconds', 0,
    'minuteRemaining', p_minute_limit - v_minute_count - 1,
    'dayRemaining', p_day_limit - v_day_count - 1
  );
end;
$$;

revoke all on function public.predarc_consume_assistant_quota_v1(
  text, integer, integer
) from public, anon, authenticated;
grant execute on function public.predarc_consume_assistant_quota_v1(
  text, integer, integer
) to service_role;

commit;
