#!/usr/bin/env bash
# Apply the migration twice (idempotency) and run the RLS/invite checks on a
# throwaway local Postgres database. Usage: scripts/db-check.sh
set -euo pipefail
cd "$(dirname "$0")/.."
DB="ft_check_$$"
createdb "$DB"
trap 'dropdb --if-exists "$DB"' EXIT
psql -q -v ON_ERROR_STOP=1 -d "$DB" -f supabase/tests/supabase_stubs.sql
psql -q -v ON_ERROR_STOP=1 -d "$DB" -f supabase/migrations/0001_init.sql
psql -q -v ON_ERROR_STOP=1 -d "$DB" -f supabase/migrations/0001_init.sql
psql -q -v ON_ERROR_STOP=1 -d "$DB" -f supabase/tests/migration_checks.sql
