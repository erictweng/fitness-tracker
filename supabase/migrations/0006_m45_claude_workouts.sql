-- M4.5: workouts, Claude connector provenance and limits. Idempotent.
--
-- Claude connects through Supabase's OAuth 2.1 server. Its access token is a normal
-- token for that user (so the usual owner-only RLS applies) plus a `client_id` claim.
-- This migration uses that claim to:
--   * stamp anything Claude writes as source = 'claude' (can't be faked from the app,
--     and the app can't be made to look like Claude),
--   * stop Claude tokens from changing settings/targets/saved foods, deleting anything,
--     deleting the account or using admin powers, even if called outside our MCP server.

-- The OAuth client behind the current request (null for normal app sessions).
create or replace function public.oauth_client_id()
returns text language sql stable set search_path = ''
as $$ select nullif(auth.jwt() ->> 'client_id', '') $$;
revoke all on function public.oauth_client_id() from public, anon;
grant execute on function public.oauth_client_id() to authenticated;

-- ---------------------------------------------------------------- workouts
create table if not exists public.workouts (
  id              uuid primary key,  -- client-generated: retries never duplicate
  user_id         uuid not null default auth.uid() references auth.users(id) on delete cascade,
  log_date        date not null,
  type            text not null check (char_length(btrim(type)) between 1 and 60),
  minutes         integer not null check (minutes between 1 and 600),
  kcal            integer check (kcal between 0 and 3000),
  notes           text check (notes is null or char_length(notes) <= 280),
  source          text not null default 'app' check (source in ('app', 'claude', 'whoop')),
  external_id     text,
  oauth_client_id text,
  deleted_at      timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index if not exists workouts_user_day on public.workouts (user_id, log_date);
alter table public.workouts enable row level security;
drop policy if exists workouts_own on public.workouts;
create policy workouts_own on public.workouts for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
revoke all on public.workouts from anon, authenticated;
grant select, insert, update, delete on public.workouts to authenticated;

-- ---------------------------------------------------------------- provenance
alter table public.entries   add column if not exists oauth_client_id text;
alter table public.weigh_ins add column if not exists oauth_client_id text;

create or replace function public.stamp_source()
returns trigger language plpgsql set search_path = ''
as $$
declare v_client text := public.oauth_client_id();
begin
  if v_client is not null then
    new.source := 'claude';
    new.oauth_client_id := v_client;
  elsif tg_op = 'INSERT' then
    if new.source = 'claude' then new.source := 'app'; end if;
    new.oauth_client_id := null;
  else
    -- An app edit keeps who created it; it can't turn a row into a Claude one.
    if new.source = 'claude' and old.source is distinct from 'claude' then new.source := old.source; end if;
    new.oauth_client_id := case when new.source = 'claude' then old.oauth_client_id end;
  end if;
  return new;
end $$;

do $$
declare t text;
begin
  foreach t in array array['entries', 'weigh_ins', 'workouts'] loop
    execute format('drop trigger if exists %I on public.%I', t || '_stamp_source', t);
    execute format('create trigger %I before insert or update on public.%I '
                   'for each row execute function public.stamp_source()', t || '_stamp_source', t);
  end loop;
end $$;

-- ---------------------------------------------------------------- limits for Claude tokens
-- Restrictive policies are ANDed with the owner policies above.
do $$
declare t text;
begin
  -- No settings, targets or saved-food changes.
  foreach t in array array['targets', 'foods', 'meals', 'meal_items'] loop
    execute format('drop policy if exists %I on public.%I', t || '_no_oauth_insert', t);
    execute format('create policy %I on public.%I as restrictive for insert to authenticated '
                   'with check (public.oauth_client_id() is null)', t || '_no_oauth_insert', t);
    execute format('drop policy if exists %I on public.%I', t || '_no_oauth_update', t);
    execute format('create policy %I on public.%I as restrictive for update to authenticated '
                   'using (public.oauth_client_id() is null)', t || '_no_oauth_update', t);
  end loop;
  -- No deletes anywhere.
  foreach t in array array['targets', 'foods', 'meals', 'meal_items', 'entries', 'weigh_ins', 'workouts'] loop
    execute format('drop policy if exists %I on public.%I', t || '_no_oauth_delete', t);
    execute format('create policy %I on public.%I as restrictive for delete to authenticated '
                   'using (public.oauth_client_id() is null)', t || '_no_oauth_delete', t);
  end loop;
  -- Logs: Claude may add and edit, but not soft-delete or touch deleted rows.
  foreach t in array array['entries', 'weigh_ins', 'workouts'] loop
    execute format('drop policy if exists %I on public.%I', t || '_no_oauth_soft_delete', t);
    execute format('create policy %I on public.%I as restrictive for update to authenticated '
                   'using (public.oauth_client_id() is null or deleted_at is null) '
                   'with check (public.oauth_client_id() is null or deleted_at is null)',
                   t || '_no_oauth_soft_delete', t);
  end loop;
end $$;

drop policy if exists profiles_no_oauth_update on public.profiles;
create policy profiles_no_oauth_update on public.profiles as restrictive for update to authenticated
  using (public.oauth_client_id() is null);

-- Admin powers and account deletion never work from a Claude token.
create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = ''
as $$
  select public.oauth_client_id() is null
     and coalesce((select p.is_admin from public.profiles p where p.user_id = auth.uid()), false)
$$;
revoke all on function public.is_admin() from public, anon;
grant execute on function public.is_admin() to authenticated;

create or replace function public.delete_my_account()
returns void language plpgsql security definer set search_path = ''
as $$
declare v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'not_signed_in' using errcode = '42501';
  end if;
  if public.oauth_client_id() is not null then
    raise exception 'not_from_connected_app' using errcode = '42501';
  end if;
  if (select p.is_admin from public.profiles p where p.user_id = v_uid)
     and (select count(*) from public.profiles p where p.is_admin) <= 1 then
    raise exception 'last_admin' using errcode = 'P0001';
  end if;
  delete from auth.users where id = v_uid;
end $$;
revoke all on function public.delete_my_account() from public, anon;
grant execute on function public.delete_my_account() to authenticated;
