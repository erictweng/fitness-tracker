#!/usr/bin/env bash
# Prove a backup restores: decrypt it, load it into a throwaway local Postgres database and
# compare row counts with the counts recorded at backup time.
#   scripts/restore-check.sh fitness-<stamp>.tar.gz.age path/to/age-identity.txt
# Uses the local Postgres from PG* env vars (same as scripts/db-check.sh). The scratch DB is dropped after.
set -euo pipefail
cd "$(dirname "$0")/.."
FILE="${1:?backup file}"
IDENTITY="${2:?age identity (private key) file}"
work="$(mktemp -d)"
DB="ft_restore_$$"
trap 'rm -rf "$work"; dropdb --if-exists "$DB"' EXIT
umask 077

age --decrypt -i "$IDENTITY" -o "$work/backup.tar.gz" "$FILE"
tar -C "$work" -xzf "$work/backup.tar.gz"
createdb "$DB"
# The few Supabase objects the dump expects to already exist (roles, auth schema, auth.uid()).
psql -X -q -v ON_ERROR_STOP=1 -d "$DB" <<'SQL'
do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then create role service_role nologin bypassrls; end if;
end $$;
create schema if not exists auth;
create or replace function auth.uid() returns uuid language sql stable
  as $f$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $f$;
SQL
# Functions and types first (triggers and policies need them), then tables + data + constraints.
pg_restore -l "$work/functions.dump" | grep -E ' (FUNCTION|TYPE) ' > "$work/functions.list"
pg_restore --no-owner --no-privileges --exit-on-error -L "$work/functions.list" -d "$DB" "$work/functions.dump"
pg_restore --no-owner --no-privileges --exit-on-error -d "$DB" "$work/data.dump" > "$work/restore.log" 2>&1 || {
  echo "restore failed:" >&2; grep -m5 -i error "$work/restore.log" >&2; exit 1; }

fail=0
while IFS=, read -r table expected; do
  if [ "$table" = "auth.users" ]; then q="select count(*) from auth.users"; else q="select count(*) from public.$table"; fi
  got="$(psql -X -At -d "$DB" -c "$q")"
  if [ "$got" = "$expected" ]; then echo "ok   $table $got"; else echo "FAIL $table expected $expected got $got"; fail=1; fi
done < "$work/counts.csv"
[ "$fail" = 0 ] && echo "restore check passed: $(basename "$FILE")"
exit "$fail"
