-- M1: source tracking (for the Claude connector later) + atomic onboarding.
-- Idempotent.

alter table public.entries   add column if not exists source text not null default 'app';
alter table public.entries   add column if not exists oauth_client_id text;
alter table public.weigh_ins add column if not exists source text not null default 'app';
alter table public.weigh_ins add column if not exists oauth_client_id text;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'entries_source_check') then
    alter table public.entries add constraint entries_source_check check (source in ('app', 'claude'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'weigh_ins_source_check') then
    alter table public.weigh_ins add constraint weigh_ins_source_check check (source in ('app', 'claude'));
  end if;
end $$;

-- Runs as the calling user (security invoker): RLS and column grants still apply.
create or replace function public.complete_onboarding(
  p_sex text,
  p_birth_date date,
  p_height_cm numeric,
  p_weight_kg numeric,
  p_activity_level text,
  p_goal text,
  p_goal_adjust_kcal integer,
  p_protein_rule text,
  p_protein_value numeric,
  p_weight_unit text,
  p_height_unit text,
  p_timezone text,
  p_today date,
  p_kcal_target integer,
  p_protein_target integer,
  p_target_source text
) returns void
language plpgsql security invoker set search_path = ''
as $$
declare v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'not_signed_in' using errcode = '42501';
  end if;
  if p_today < current_date - 2 or p_today > current_date + 2 then
    raise exception 'bad_today' using errcode = '22023';
  end if;
  if p_birth_date > p_today - interval '13 years' or p_birth_date < p_today - interval '100 years' then
    raise exception 'bad_birth_date' using errcode = '22023';
  end if;

  update public.profiles set
    sex = p_sex, birth_date = p_birth_date, height_cm = p_height_cm,
    activity_level = p_activity_level, goal = p_goal, goal_adjust_kcal = p_goal_adjust_kcal,
    protein_rule = p_protein_rule, protein_value = p_protein_value,
    weight_unit = p_weight_unit, height_unit = p_height_unit, timezone = p_timezone,
    onboarded_at = coalesce(onboarded_at, now())
  where user_id = v_uid;
  if not found then
    raise exception 'no_profile' using errcode = 'P0002';
  end if;

  insert into public.weigh_ins (id, log_date, weight_kg)
  values (gen_random_uuid(), p_today, p_weight_kg)
  on conflict (user_id, log_date) do update set weight_kg = excluded.weight_kg, deleted_at = null, updated_at = now();

  insert into public.targets (effective_from, kcal, protein_g, source)
  values (p_today, p_kcal_target, p_protein_target, p_target_source);
end $$;

revoke all on function public.complete_onboarding(text, date, numeric, numeric, text, text, integer, text, numeric, text, text, text, date, integer, integer, text) from public, anon;
grant execute on function public.complete_onboarding(text, date, numeric, numeric, text, text, integer, text, numeric, text, text, text, date, integer, integer, text) to authenticated;
