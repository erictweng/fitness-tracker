-- M5: WHOOP. Each user connects their own WHOOP (read-only: cycles + workouts). Idempotent.
--
-- * whoop_connections holds the user's WHOOP tokens, already encrypted by the app server
--   (AES-GCM, key derived from the WHOOP client secret, which only the server has).
--   No one can read or write the table directly — not even its owner — only through the
--   functions below, which refuse connected apps (Claude).
-- * whoop_days is the day's total burn from WHOOP; owner can read it, only the sync writes it.
-- * WHOOP workouts land in public.workouts with source = 'whoop' and the WHOOP id.

-- ---------------------------------------------------------------- connections (tokens)
create table if not exists public.whoop_connections (
  user_id          uuid primary key references auth.users(id) on delete cascade,
  whoop_user_id    bigint,
  access_token     text not null,   -- encrypted by the app ("v1:…"), never plaintext
  refresh_token    text,            -- encrypted by the app
  expires_at       timestamptz not null,
  scope            text,
  sync_started_at  timestamptz,     -- lock: one sync at a time (WHOOP refresh tokens rotate)
  last_sync_at     timestamptz,
  last_error       text,
  connected_at     timestamptz not null default now()
);
alter table public.whoop_connections enable row level security;
revoke all on public.whoop_connections from public, anon, authenticated;

-- ---------------------------------------------------------------- day totals
create table if not exists public.whoop_days (
  user_id      uuid not null default auth.uid() references auth.users(id) on delete cascade,
  log_date     date not null,
  kcal         integer check (kcal between 0 and 20000),  -- null while WHOOP is still scoring
  in_progress  boolean not null default false,             -- current cycle: number still growing
  updated_at   timestamptz not null default now(),
  primary key (user_id, log_date)
);
alter table public.whoop_days enable row level security;
drop policy if exists whoop_days_read_own on public.whoop_days;
create policy whoop_days_read_own on public.whoop_days for select to authenticated
  using (user_id = auth.uid());
revoke all on public.whoop_days from public, anon, authenticated;
grant select on public.whoop_days to authenticated;

-- One row per WHOOP workout per user.
create unique index if not exists workouts_whoop_once
  on public.workouts (user_id, external_id) where source = 'whoop';

-- ---------------------------------------------------------------- functions
create or replace function public.whoop_require_app_session()
returns uuid language plpgsql stable set search_path = ''
as $$
declare v_uid uuid := auth.uid();
begin
  if v_uid is null then raise exception 'not_signed_in' using errcode = '42501'; end if;
  if public.oauth_client_id() is not null then
    raise exception 'not_from_connected_app' using errcode = '42501';
  end if;
  return v_uid;
end $$;
revoke all on function public.whoop_require_app_session() from public, anon;
grant execute on function public.whoop_require_app_session() to authenticated;

-- Connected? (no tokens returned)
create or replace function public.whoop_status()
returns table (connected boolean, connected_at timestamptz, last_sync_at timestamptz, last_error text)
language sql stable security definer set search_path = ''
as $$
  select true, c.connected_at, c.last_sync_at, c.last_error
  from public.whoop_connections c
  where c.user_id = auth.uid() and public.oauth_client_id() is null
$$;
revoke all on function public.whoop_status() from public, anon;
grant execute on function public.whoop_status() to authenticated;

create or replace function public.whoop_save_connection(
  p_whoop_user_id bigint, p_access text, p_refresh text, p_expires_at timestamptz, p_scope text)
returns void language plpgsql security definer set search_path = ''
as $$
declare v_uid uuid := public.whoop_require_app_session();
begin
  if p_access not like 'v1:%' or (p_refresh is not null and p_refresh not like 'v1:%') then
    raise exception 'tokens_must_be_encrypted' using errcode = '22023';
  end if;
  insert into public.whoop_connections (user_id, whoop_user_id, access_token, refresh_token, expires_at, scope)
  values (v_uid, p_whoop_user_id, p_access, p_refresh, p_expires_at, p_scope)
  on conflict (user_id) do update set
    whoop_user_id = excluded.whoop_user_id, access_token = excluded.access_token,
    refresh_token = excluded.refresh_token, expires_at = excluded.expires_at, scope = excluded.scope,
    sync_started_at = null, last_error = null, connected_at = now();
end $$;
revoke all on function public.whoop_save_connection(bigint, text, text, timestamptz, text) from public, anon;
grant execute on function public.whoop_save_connection(bigint, text, text, timestamptz, text) to authenticated;

-- Take the sync lock and get the (encrypted) tokens. Null when not connected, or when
-- another sync started less than 60 s ago, or the last sync is newer than p_min_age_seconds
-- (0 = sync anyway, e.g. the "Sync now" button).
create or replace function public.whoop_begin_sync(p_min_age_seconds integer default 600)
returns table (access_token text, refresh_token text, expires_at timestamptz, last_sync_at timestamptz)
language plpgsql security definer set search_path = ''
as $$
declare v_uid uuid := public.whoop_require_app_session();
begin
  return query
  update public.whoop_connections c set sync_started_at = now()
  where c.user_id = v_uid
    and (c.sync_started_at is null or c.sync_started_at < now() - interval '60 seconds')
    and (p_min_age_seconds <= 0 or c.last_sync_at is null
         or c.last_sync_at < now() - make_interval(secs => p_min_age_seconds))
  returning c.access_token, c.refresh_token, c.expires_at, c.last_sync_at;
end $$;
revoke all on function public.whoop_begin_sync(integer) from public, anon;
grant execute on function public.whoop_begin_sync(integer) to authenticated;

-- Tokens for disconnect (to revoke at WHOOP). Encrypted.
create or replace function public.whoop_tokens()
returns table (access_token text, refresh_token text, expires_at timestamptz)
language sql security definer set search_path = ''
as $$
  select c.access_token, c.refresh_token, c.expires_at from public.whoop_connections c
  where c.user_id = public.whoop_require_app_session()
$$;
revoke all on function public.whoop_tokens() from public, anon;
grant execute on function public.whoop_tokens() to authenticated;

-- Finish a sync: store rotated tokens (if any), import days + workouts, release the lock.
-- p_days:     [{log_date, kcal|null, in_progress}]  (replaces those dates)
-- p_workouts: [{external_id, log_date, type, minutes, kcal|null, notes|null}]
create or replace function public.whoop_finish_sync(
  p_access text, p_refresh text, p_expires_at timestamptz,
  p_days jsonb, p_workouts jsonb, p_error text)
returns void language plpgsql security definer set search_path = ''
as $$
declare v_uid uuid := public.whoop_require_app_session();
begin
  if not exists (select 1 from public.whoop_connections where user_id = v_uid) then return; end if;
  if (p_access is not null and p_access not like 'v1:%') or (p_refresh is not null and p_refresh not like 'v1:%') then
    raise exception 'tokens_must_be_encrypted' using errcode = '22023';
  end if;
  update public.whoop_connections set
    access_token  = coalesce(p_access, access_token),
    refresh_token = coalesce(p_refresh, refresh_token),
    expires_at    = coalesce(p_expires_at, expires_at),
    sync_started_at = null,
    last_sync_at  = case when p_error is null then now() else last_sync_at end,
    last_error    = left(p_error, 200)
  where user_id = v_uid;

  insert into public.whoop_days (user_id, log_date, kcal, in_progress, updated_at)
  select v_uid, (d ->> 'log_date')::date, (d ->> 'kcal')::integer, coalesce((d ->> 'in_progress')::boolean, false), now()
  from jsonb_array_elements(coalesce(p_days, '[]'::jsonb)) d
  on conflict (user_id, log_date) do update set
    kcal = excluded.kcal, in_progress = excluded.in_progress, updated_at = now();

  -- New WHOOP workouts are added. Existing ones only fill in numbers WHOOP hadn't scored
  -- yet; a workout the user deleted stays deleted.
  insert into public.workouts (id, user_id, log_date, type, minutes, kcal, notes, source, external_id)
  select gen_random_uuid(), v_uid, (w ->> 'log_date')::date, left(w ->> 'type', 60),
         least(greatest((w ->> 'minutes')::integer, 1), 600),
         case when w ->> 'kcal' is null then null  -- unscored stays unknown (LEAST skips nulls)
              else least((w ->> 'kcal')::integer, 3000) end, left(w ->> 'notes', 280), 'whoop', w ->> 'external_id'
  from jsonb_array_elements(coalesce(p_workouts, '[]'::jsonb)) w
  on conflict (user_id, external_id) where source = 'whoop' do update set
    kcal = excluded.kcal, minutes = excluded.minutes, notes = excluded.notes, updated_at = now()
  where public.workouts.kcal is null and public.workouts.deleted_at is null;
end $$;
revoke all on function public.whoop_finish_sync(text, text, timestamptz, jsonb, jsonb, text) from public, anon;
grant execute on function public.whoop_finish_sync(text, text, timestamptz, jsonb, jsonb, text) to authenticated;

-- Disconnect: delete the stored tokens. Imported history stays (export/delete account removes it).
create or replace function public.whoop_disconnect()
returns void language plpgsql security definer set search_path = ''
as $$
begin
  delete from public.whoop_connections where user_id = public.whoop_require_app_session();
end $$;
revoke all on function public.whoop_disconnect() from public, anon;
grant execute on function public.whoop_disconnect() to authenticated;
