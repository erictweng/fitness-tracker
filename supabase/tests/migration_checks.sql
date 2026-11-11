\set ON_ERROR_STOP on
-- M0 acceptance checks: invite gate, per-user isolation, admin can't read data.
-- Fake people only (example.com). Runs as a superuser against a scratch DB.

insert into public.invites (email, is_admin) values
  ('admin@example.com', true), ('friend@example.com', false), ('pending@example.com', false);

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-00000000000a', 'Admin@Example.com'),
  ('00000000-0000-0000-0000-00000000000b', 'friend@example.com');

do $$ begin
  assert (select is_admin from public.profiles where user_id = '00000000-0000-0000-0000-00000000000a'),
    'admin profile should be admin';
  assert (select email from public.profiles where user_id = '00000000-0000-0000-0000-00000000000a') = 'admin@example.com',
    'profile email should be normalised';
  assert not (select is_admin from public.profiles where user_id = '00000000-0000-0000-0000-00000000000b'),
    'friend must not be admin';
  assert (select accepted_at is not null from public.invites where email = 'friend@example.com'),
    'invite should be marked accepted';
end $$;

-- Uninvited sign-up is rejected and leaves nothing behind.
do $$ begin
  begin
    insert into auth.users (id, email) values ('00000000-0000-0000-0000-0000000000cc', 'stranger@example.com');
    raise exception 'uninvited sign-up should have failed';
  exception when raise_exception then
    if sqlerrm <> 'not_invited' then raise; end if;
  end;
  assert not exists (select 1 from auth.users where email = 'stranger@example.com'), 'no auth user for stranger';
  assert not exists (select 1 from public.profiles where email = 'stranger@example.com'), 'no profile for stranger';
end $$;

-- ---------------- as the friend
set role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000b', false);

insert into public.entries (id, log_date, meal, name, kcal, protein_g)
values ('11111111-1111-1111-1111-111111111111', '2026-11-12', 'lunch', 'Chicken bowl', 650, 48);

do $$ begin
  assert (select count(*) from public.entries) = 1, 'friend sees own entry';
  assert (select count(*) from public.profiles) = 1, 'friend sees only own profile';
  -- Retrying the same offline entry id is a conflict, not a duplicate.
  begin
    insert into public.entries (id, log_date, meal, kcal) values ('11111111-1111-1111-1111-111111111111', '2026-11-12', 'lunch', 1);
    raise exception 'duplicate id should conflict';
  exception when unique_violation then null; end;
  -- Cannot write a row for someone else.
  begin
    insert into public.entries (id, user_id, log_date, meal, kcal)
    values (gen_random_uuid(), '00000000-0000-0000-0000-00000000000a', '2026-11-12', 'lunch', 1);
    raise exception 'writing another user''s row should fail';
  exception when insufficient_privilege then null; end;
  -- Cannot read invites directly.
  begin
    perform 1 from public.invites;
    raise exception 'friend should not read invites';
  exception when insufficient_privilege then null; end;
  -- Cannot use admin RPCs.
  begin
    perform public.admin_invite('x@example.com');
    raise exception 'friend should not invite';
  exception when insufficient_privilege then null; end;
  begin
    perform * from public.admin_list_users();
    raise exception 'friend should not list users';
  exception when insufficient_privilege then null; end;
  -- Cannot promote self.
  begin
    update public.profiles set is_admin = true where user_id = auth.uid();
    raise exception 'friend should not set is_admin';
  exception when insufficient_privilege then null; end;
  -- Can change own settings.
  update public.profiles set goal = 'bulk', goal_adjust_kcal = 300, weight_unit = 'kg' where user_id = auth.uid();
  assert (select goal from public.profiles) = 'bulk', 'friend can edit own settings';
end $$;

-- ---------------- as the admin
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000a', false);
do $$ begin
  assert (select count(*) from public.entries) = 0, 'admin must NOT see friend entries';
  assert (select count(*) from public.entries where user_id = '00000000-0000-0000-0000-00000000000b') = 0,
    'admin filtering by friend id still sees nothing';
  assert (select count(*) from public.profiles) = 1, 'admin sees only own profile row';
  assert (select count(*) from public.admin_list_users()) = 2, 'admin lists both users';
  perform public.admin_invite('  New.Person@Example.COM ');
  assert exists (select 1 from public.admin_list_pending_invites() where email = 'new.person@example.com'),
    'invite stored normalised';
  perform public.admin_revoke_invite('pending@example.com');
  assert not exists (select 1 from public.admin_list_pending_invites() where email = 'pending@example.com'),
    'revoked invite no longer pending';
  perform public.touch_last_active();
  assert (select last_active_at is not null from public.profiles), 'touch_last_active sets own row';
end $$;

-- ---------------- anonymous
reset role;
set role anon;
do $$ begin
  begin
    perform 1 from public.entries;
    raise exception 'anon should not read entries';
  exception when insufficient_privilege then null; end;
  begin
    perform public.admin_list_users();
    raise exception 'anon should not call admin RPCs';
  exception when insufficient_privilege then null; end;
end $$;
reset role;

-- Revoked invite can no longer sign up.
do $$ begin
  begin
    insert into auth.users (id, email) values ('00000000-0000-0000-0000-0000000000dd', 'pending@example.com');
    raise exception 'revoked invite should block sign-up';
  exception when raise_exception then
    if sqlerrm <> 'not_invited' then raise; end if;
  end;
end $$;

\echo 'fitness-tracker migration checks passed'
