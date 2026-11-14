-- M4: entry notes, self-service account deletion, admin removal. Idempotent.

alter table public.entries add column if not exists notes text;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'entries_notes_len') then
    alter table public.entries add constraint entries_notes_len check (notes is null or char_length(notes) <= 280);
  end if;
end $$;

-- F10: a user deletes their own account. Every data table cascades from auth.users,
-- so deleting the login deletes all their rows in the same statement.
create or replace function public.delete_my_account()
returns void language plpgsql security definer set search_path = ''
as $$
declare v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'not_signed_in' using errcode = '42501';
  end if;
  if (select p.is_admin from public.profiles p where p.user_id = v_uid)
     and (select count(*) from public.profiles p where p.is_admin) <= 1 then
    raise exception 'last_admin' using errcode = 'P0001';
  end if;
  delete from auth.users where id = v_uid;
end $$;

-- F11: the admin removes a user: same deletion, and their invite is revoked so they can't sign back in.
create or replace function public.admin_remove_user(p_email text)
returns void language plpgsql security definer set search_path = ''
as $$
declare
  v_email text := lower(btrim(coalesce(p_email, '')));
  v_uid uuid;
begin
  if not public.is_admin() then
    raise exception 'not_admin' using errcode = '42501';
  end if;
  select p.user_id into v_uid from public.profiles p where p.email = v_email;
  if v_uid is null then
    raise exception 'no_such_user' using errcode = 'P0002';
  end if;
  if v_uid = auth.uid() then
    raise exception 'cannot_remove_self' using errcode = 'P0001';
  end if;
  update public.invites set revoked_at = now() where email = v_email;
  delete from auth.users where id = v_uid;
end $$;

do $$
declare f text;
begin
  foreach f in array array['delete_my_account()', 'admin_remove_user(text)'] loop
    execute format('revoke all on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
end $$;
