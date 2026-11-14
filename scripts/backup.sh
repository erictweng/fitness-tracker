#!/usr/bin/env bash
# Encrypted logical backup of the app database.
#   DB_URL=postgresql://... [AGE_RECIPIENTS_FILE=backup/age-recipients.txt] [OUT=.] scripts/backup.sh
# Needs pg_dump/psql 17+ and age. Writes $OUT/fitness-<UTC stamp>.tar.gz.age, encrypted to the
# public key(s) in the recipients file; only the private key (Eric's password manager) can read it.
# Prints only the file name, its size and row counts: CI logs of a public repo are public.
set -euo pipefail
cd "$(dirname "$0")/.."
: "${DB_URL:?set DB_URL}"
RECIPIENTS="${AGE_RECIPIENTS_FILE:-backup/age-recipients.txt}"
OUT="${OUT:-.}"
grep -q '^age1' "$RECIPIENTS" || { echo "no age public key in $RECIPIENTS" >&2; exit 1; }
mkdir -p "$OUT"
work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT
umask 077
stamp="$(date -u +%Y%m%dT%H%M%SZ)"

# 1) data.dump: every app table plus the two auth tables the rows hang off (logins + Google
#    identities), with data, constraints, triggers and RLS policies, all from ONE snapshot so
#    rows and their owners always match.
# 2) functions.dump: schema-only copy of the app schema; restore takes only its functions/types
#    (pg_dump --table can't include functions, and they don't need to match a snapshot).
pg_dump "$DB_URL" --no-owner --no-privileges --format=custom \
  --table='public.*' --table=auth.users --table=auth.identities \
  --file="$work/data.dump"
pg_dump "$DB_URL" --no-owner --no-privileges --format=custom --schema-only \
  --schema=public --file="$work/functions.dump"

psql "$DB_URL" -X -q -At -F, -v ON_ERROR_STOP=1 -c "
  select 'auth.users', count(*) from auth.users
  union all select 'invites', count(*) from public.invites
  union all select 'profiles', count(*) from public.profiles
  union all select 'foods', count(*) from public.foods
  union all select 'meals', count(*) from public.meals
  union all select 'meal_items', count(*) from public.meal_items
  union all select 'entries', count(*) from public.entries
  union all select 'weigh_ins', count(*) from public.weigh_ins
  union all select 'targets', count(*) from public.targets" > "$work/counts.csv"

tar -C "$work" -czf "$work/backup.tar.gz" data.dump functions.dump counts.csv
name="fitness-$stamp.tar.gz.age"
age --encrypt -R "$RECIPIENTS" -o "$OUT/$name" "$work/backup.tar.gz"
echo "backup: $name ($(wc -c < "$OUT/$name" | tr -d ' ') bytes, encrypted)"
echo "row counts:"
sed 's/^/  /' "$work/counts.csv"
