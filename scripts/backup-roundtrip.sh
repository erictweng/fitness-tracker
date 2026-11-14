#!/usr/bin/env bash
# CI/local proof that backups work end to end without real data or real keys:
# build a scratch DB from the migrations + test fixtures, back it up with a throwaway age key,
# restore it into another scratch DB and compare row counts. Also checks a wrong key can't decrypt.
set -euo pipefail
cd "$(dirname "$0")/.."
SRC="ft_bk_src_$$"
work="$(mktemp -d)"
trap 'rm -rf "$work"; dropdb --if-exists "$SRC"' EXIT
createdb "$SRC"
psql -X -q -v ON_ERROR_STOP=1 -d "$SRC" -f supabase/tests/supabase_stubs.sql
for f in supabase/migrations/*.sql; do psql -X -q -v ON_ERROR_STOP=1 -d "$SRC" -f "$f"; done
psql -X -q -v ON_ERROR_STOP=1 -d "$SRC" -f supabase/tests/migration_checks.sql > /dev/null
age-keygen -o "$work/id.txt" 2> /dev/null
age-keygen -y "$work/id.txt" > "$work/recipients.txt"
age-keygen -o "$work/wrong.txt" 2> /dev/null

DB_URL="postgresql:///$SRC" AGE_RECIPIENTS_FILE="$work/recipients.txt" OUT="$work/out" scripts/backup.sh
file="$(ls "$work"/out/*.age)"
if age --decrypt -i "$work/wrong.txt" -o /dev/null "$file" 2> /dev/null; then
  echo "FAIL: a different key decrypted the backup" >&2; exit 1
fi
echo "ok   wrong key can't decrypt"
scripts/restore-check.sh "$file" "$work/id.txt"
