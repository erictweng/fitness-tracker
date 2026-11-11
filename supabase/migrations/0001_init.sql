-- Fitness Tracker: initial schema (M0)
-- Idempotent: safe to run more than once.
-- Security model:
--   * Every data table: RLS, a user sees and writes only rows where user_id = auth.uid().
--   * There is NO admin bypass on data tables. Admin powers are a few security-definer
--     RPCs that touch invites and the user list only.
--   * Sign-up is invite-only: a trigger on auth.users rejects any email without an open invite.

-- ---------------------------------------------------------------- invites
create table if not exists public.invites (
  email       text primary key
              check (email = lower(btrim(email)) and email ~ '^[^\s@]+@[^\s@]+\.[^\s@]+$'),
  is_admin    boolean not null default false,
  invited_at  timestamptz not null default now(),
  accepted_at timestamptz,
  revoked_at  timestamptz
);
alter table public.invites enable row level security;
-- No policies: clients never touch invites directly, only through admin RPCs.
revoke all on public.invites from anon, authenticated;

-- ---------------------------------------------------------------- profiles
create table if not exists public.profiles (
  user_id          uuid primary key references auth.users(id) on delete cascade,
  email            text not null unique,
  is_admin         boolean not null default false,
  sex              text check (sex in ('male', 'female')),
  birth_date       date,
  height_cm        numeric(5,1) check (height_cm between 120 and 230),
  activity_level   text check (activity_level in ('sedentary', 'light', 'moderate', 'very_active')),
  goal             text not null default 'cut' check (goal in ('cut', 'maintain', 'bulk')),
  goal_adjust_kcal integer not null default -500 check (goal_adjust_kcal between -1500 and 1500),
  protein_rule     text not null default 'per_lb' check (protein_rule in ('per_lb', 'per_kg', 'fixed')),
  protein_value    numeric(6,2) not null default 1.00 check (protein_value > 0 and protein_value <= 500),
  weight_unit      text not null default 'lb' check (weight_unit in ('lb', 'kg')),
  height_unit      text not null default 'ftin' check (height_unit in ('ftin', 'cm')),
  day_end_hour     smallint not null default 3 check (day_end_hour between 0 and 6),
  require_protein  boolean not null default true,
  require_fat      boolean not null default false,
  require_carbs    boolean not null default false,
  timezone         text not null default 'America/Los_Angeles',
  onboarded_at     timestamptz,
  created_at       timestamptz not null default now(),
  last_active_at   timestamptz
);
alter table public.profiles enable row level security;

drop policy if exists profiles_select_own on public.profiles;
create policy profiles_select_own on public.profiles
  for select to authenticated using (user_id = auth.uid());
drop policy if exists profiles_update_own on public.profiles;
create policy profiles_update_own on public.profiles
  for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

revoke all on public.profiles from anon, authenticated;
grant select on public.profiles to authenticated;
-- Column-level: users edit their settings, never email / is_admin / user_id / timestamps.
grant update (sex, birth_date, height_cm, activity_level, goal, goal_adjust_kcal,
              protein_rule, protein_value, weight_unit, height_unit, day_end_hour,
              require_protein, require_fat, require_carbs, timezone, onboarded_at)
  on public.profiles to authenticated;

-- ---------------------------------------------------------------- data tables
create table if not exists public.foods (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name          text not null check (char_length(name) between 1 and 80),
  kcal          numeric(7,1) not null check (kcal >= 0),
  protein_g     numeric(6,1) check (protein_g >= 0),
  fat_g         numeric(6,1) check (fat_g >= 0),
  carbs_g       numeric(6,1) check (carbs_g >= 0),
  serving_label text not null default '1 serving' check (char_length(serving_label) <= 40),
  serving_g     numeric(7,1) check (serving_g > 0),
  archived_at   timestamptz,
  created_at    timestamptz not null default now()
);

create table if not exists public.meals (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name       text not null check (char_length(name) between 1 and 80),
  created_at timestamptz not null default now()
);

create table if not exists public.meal_items (
  id       uuid primary key default gen_random_uuid(),
  user_id  uuid not null default auth.uid() references auth.users(id) on delete cascade,
  meal_id  uuid not null references public.meals(id) on delete cascade,
  food_id  uuid not null references public.foods(id),
  servings numeric(6,2) not null default 1 check (servings > 0)
);

create table if not exists public.entries (
  id         uuid primary key,  -- generated on the phone so offline retries are idempotent
  user_id    uuid not null default auth.uid() references auth.users(id) on delete cascade,
  log_date   date not null,
  logged_at  timestamptz not null default now(),
  meal       text not null check (meal in ('breakfast', 'lunch', 'dinner', 'snack')),
  food_id    uuid references public.foods(id),
  name       text not null default '' check (char_length(name) <= 80),
  servings   numeric(6,2) check (servings > 0),
  grams      numeric(7,1) check (grams > 0),
  kcal       numeric(7,1) not null check (kcal >= 0),
  protein_g  numeric(6,1) check (protein_g >= 0),
  fat_g      numeric(6,1) check (fat_g >= 0),
  carbs_g    numeric(6,1) check (carbs_g >= 0),
  deleted_at timestamptz,
  updated_at timestamptz not null default now()
);
create index if not exists entries_user_day on public.entries (user_id, log_date);

create table if not exists public.weigh_ins (
  id         uuid primary key,
  user_id    uuid not null default auth.uid() references auth.users(id) on delete cascade,
  log_date   date not null,
  weight_kg  numeric(5,2) not null check (weight_kg between 30 and 230),
  deleted_at timestamptz,
  updated_at timestamptz not null default now(),
  unique (user_id, log_date)
);

create table if not exists public.targets (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null default auth.uid() references auth.users(id) on delete cascade,
  effective_from date not null,
  kcal           integer not null check (kcal between 800 and 8000),
  protein_g      integer not null check (protein_g between 0 and 500),
  source         text not null check (source in ('suggested', 'manual')),
  created_at     timestamptz not null default now()
);
create index if not exists targets_user_from on public.targets (user_id, effective_from desc);

-- Same owner-only policy set on every data table.
do $$
declare t text;
begin
  foreach t in array array['foods', 'meals', 'meal_items', 'entries', 'weigh_ins', 'targets'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists %I on public.%I', t || '_own', t);
    execute format(
      'create policy %I on public.%I for all to authenticated '
      'using (user_id = auth.uid()) with check (user_id = auth.uid())', t || '_own', t);
    execute format('revoke all on public.%I from anon, authenticated', t);
    execute format('grant select, insert, update, delete on public.%I to authenticated', t);
  end loop;
end $$;

-- ---------------------------------------------------------------- helpers
create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = ''
as $$
  select coalesce((select p.is_admin from public.profiles p where p.user_id = auth.uid()), false)
$$;
revoke all on function public.is_admin() from public, anon;
grant execute on function public.is_admin() to authenticated;

-- ---------------------------------------------------------------- invite gate
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = ''
as $$
declare
  v_email text := lower(btrim(coalesce(new.email, '')));
  v_admin boolean;
begin
  select i.is_admin into v_admin
    from public.invites i
   where i.email = v_email and i.revoked_at is null;
  if not found then
    raise exception 'not_invited' using errcode = 'P0001';
  end if;
  update public.invites set accepted_at = coalesce(accepted_at, now()) where email = v_email;
  insert into public.profiles (user_id, email, is_admin)
  values (new.id, v_email, v_admin)
  on conflict (user_id) do nothing;
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------- admin RPCs
create or replace function public.admin_invite(p_email text)
returns void language plpgsql security definer set search_path = ''
as $$
declare v_email text := lower(btrim(coalesce(p_email, '')));
begin
  if not public.is_admin() then
    raise exception 'not_admin' using errcode = '42501';
  end if;
  insert into public.invites (email) values (v_email)
  on conflict (email) do update set revoked_at = null;
end $$;

create or replace function public.admin_revoke_invite(p_email text)
returns void language plpgsql security definer set search_path = ''
as $$
declare v_email text := lower(btrim(coalesce(p_email, '')));
begin
  if not public.is_admin() then
    raise exception 'not_admin' using errcode = '42501';
  end if;
  update public.invites set revoked_at = now()
   where email = v_email and accepted_at is null and revoked_at is null;
end $$;

create or replace function public.admin_list_users()
returns table (email text, is_admin boolean, joined_at timestamptz, last_active_at timestamptz)
language plpgsql stable security definer set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception 'not_admin' using errcode = '42501';
  end if;
  return query
    select p.email, p.is_admin, p.created_at, p.last_active_at
      from public.profiles p
     order by p.created_at;
end $$;

create or replace function public.admin_list_pending_invites()
returns table (email text, invited_at timestamptz)
language plpgsql stable security definer set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception 'not_admin' using errcode = '42501';
  end if;
  return query
    select i.email, i.invited_at
      from public.invites i
     where i.accepted_at is null and i.revoked_at is null
     order by i.invited_at;
end $$;

create or replace function public.touch_last_active()
returns void language sql security definer set search_path = ''
as $$
  update public.profiles set last_active_at = now()
   where user_id = auth.uid()
     and (last_active_at is null or last_active_at < now() - interval '10 minutes')
$$;

do $$
declare f text;
begin
  foreach f in array array['admin_invite(text)', 'admin_revoke_invite(text)', 'admin_list_users()',
                           'admin_list_pending_invites()', 'touch_last_active()'] loop
    execute format('revoke all on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
end $$;
revoke all on function public.handle_new_user() from public, anon, authenticated;
