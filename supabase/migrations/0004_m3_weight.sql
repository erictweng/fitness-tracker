-- M3: weigh-ins + weekly target suggestions. Idempotent.

alter table public.profiles add column if not exists suggestion_dismissed_week date;
grant update (suggestion_dismissed_week) on public.profiles to authenticated;

-- Save one weigh-in per day (replaces that day's value). Returns the previous
-- value for Undo (null if the day was empty). Runs as the caller: RLS applies.
create or replace function public.save_weigh_in(p_id uuid, p_log_date date, p_weight_kg numeric, p_source text default 'app')
returns numeric
language plpgsql security invoker set search_path = ''
as $$
declare v_prev numeric;
begin
  if auth.uid() is null then
    raise exception 'not_signed_in' using errcode = '42501';
  end if;
  if p_log_date > current_date + 1 then
    raise exception 'future_date' using errcode = '22023';
  end if;
  select w.weight_kg into v_prev from public.weigh_ins w
   where w.user_id = auth.uid() and w.log_date = p_log_date and w.deleted_at is null;
  insert into public.weigh_ins (id, log_date, weight_kg, source)
  values (p_id, p_log_date, p_weight_kg, p_source)
  on conflict (user_id, log_date) do update
    set weight_kg = excluded.weight_kg, source = excluded.source, deleted_at = null, updated_at = now();
  return v_prev;
end $$;
revoke all on function public.save_weigh_in(uuid, date, numeric, text) from public, anon;
grant execute on function public.save_weigh_in(uuid, date, numeric, text) to authenticated;
