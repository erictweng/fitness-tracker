-- M2: saved foods & meals. Foreign keys skip RLS, so make sure a row can only
-- point at the same user's food/meal (otherwise someone could reference another
-- user's food id in their own meal or entry). Idempotent.

create or replace function public.check_same_owner()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  if tg_table_name = 'meal_items' then
    if not exists (select 1 from public.meals m where m.id = new.meal_id and m.user_id = new.user_id)
       or not exists (select 1 from public.foods f where f.id = new.food_id and f.user_id = new.user_id) then
      raise exception 'owner_mismatch' using errcode = '42501';
    end if;
  elsif tg_table_name = 'entries' then
    if new.food_id is not null
       and not exists (select 1 from public.foods f where f.id = new.food_id and f.user_id = new.user_id) then
      raise exception 'owner_mismatch' using errcode = '42501';
    end if;
  end if;
  return new;
end $$;
revoke all on function public.check_same_owner() from public, anon, authenticated;

drop trigger if exists meal_items_same_owner on public.meal_items;
create trigger meal_items_same_owner before insert or update on public.meal_items
  for each row execute function public.check_same_owner();

drop trigger if exists entries_same_owner on public.entries;
create trigger entries_same_owner before insert or update of food_id, user_id on public.entries
  for each row execute function public.check_same_owner();

create index if not exists foods_user_name on public.foods (user_id, lower(name)) where archived_at is null;
create index if not exists entries_user_food_recent on public.entries (user_id, logged_at desc) where food_id is not null and deleted_at is null;
create index if not exists meal_items_meal on public.meal_items (meal_id);
