# Backups

A GitHub Action (`.github/workflows/backup.yml`) runs daily at ~3 AM Pacific:

1. `pg_dump` the app tables and the auth tables they hang off (one consistent snapshot) plus the app's functions.
2. Encrypt with [age](https://age-encryption.org) to the **public** key in `backup/age-recipients.txt`.
3. Upload `fitness-<UTC time>.tar.gz.age` to a private Cloudflare R2 bucket and keep the newest 30.

The log shows only the file name, size and row counts (the repo is public, so its Action logs are too).
Until everything below is set up, the job does nothing and shows a "Backup not set up yet" warning.

CI proves the scripts work on every push (`scripts/backup-roundtrip.sh`: back up test data with a throwaway key, check a wrong key can't decrypt, restore, compare row counts).

## One-time setup (Eric)

Never paste any of these values into chat. They go only into the places named below.

### 1. Encryption key (on your Mac)
```sh
brew install age
age-keygen -o fitness-backup-key.txt
```
- It prints `Public key: age1…`. Put **that public line** in `backup/age-recipients.txt` (replace the comment lines) and commit it.
- Store the **whole file** `fitness-backup-key.txt` in your password manager (it starts with `AGE-SECRET-KEY-`), then delete the file from disk.
- Lose it and the backups can't be read by anyone, including you.

### 2. Cloudflare R2
1. dash.cloudflare.com → **R2 Object Storage** → enable (free tier: 10 GB).
2. **Create bucket** → name e.g. `fitness-backups` → location automatic. Leave public access **off**.
3. **R2 → Manage API tokens → Create API token** → permission **Object Read & Write**, scope **only that bucket**. Copy the Access Key ID and Secret Access Key (shown once).
4. Note your **Account ID** (right sidebar of the R2 page).

### 3. Database connection string
Supabase → **Connect** (top bar) → **Session pooler** → copy the URI (`postgresql://postgres.<ref>:[YOUR-PASSWORD]@aws-…pooler.supabase.com:5432/postgres`) and put your database password in it.
Use the **session pooler**, not "Direct connection": GitHub's runners have no IPv6 and the direct host is IPv6-only.

### 4. GitHub secrets (in a protected environment)
Repo → **Settings → Environments → New environment** → `backup`.
- **Deployment branches and tags** → *Selected branches* → add `main`.
- **Environment secrets** → add:
  - `BACKUP_DB_URL` — the session pooler URI from step 3
  - `R2_ACCOUNT_ID`
  - `R2_BUCKET`
  - `R2_ACCESS_KEY_ID`
  - `R2_SECRET_ACCESS_KEY`

Then **Actions → Backup → Run workflow** once and check the log says `backup: fitness-….tar.gz.age` and `backups stored: 1`.

### 5. Protect `main` (because of the collaborator)
Anyone with write access can push a workflow that reads repository secrets. Keeping the secrets in the `backup` environment limited to `main`, plus **Settings → Branches → add rule for `main` → Require a pull request before merging (1 approval)**, means a new workflow only gets the database URL after you've reviewed it.

## Restore drill (do once before launch, then every few months)
```sh
# download the newest backup from the R2 dashboard, put the key file back on disk temporarily, then:
scripts/restore-check.sh fitness-<stamp>.tar.gz.age fitness-backup-key.txt
rm fitness-backup-key.txt
```
It restores into a throwaway local Postgres (Homebrew `postgresql@17`) and prints `ok` per table with matching row counts, then `restore check passed`.

## Real disaster restore (into a new Supabase project)
Outline only: not rehearsed against a real Supabase project yet (the restore drill above proves the backup itself is complete and readable).
1. Create the project, run `supabase/migrations/*.sql` in order in the SQL Editor.
2. Decrypt and unpack the backup (`age -d -i key.txt file.age | tar xz`).
3. Load the data: `pg_restore --data-only --no-owner --disable-triggers -d "<new session pooler URI>" -t users -t identities -n auth data.dump`, then the same with `-n public`.
4. Redo Google sign-in setup (docs/SETUP.md) and point Vercel at the new project.
