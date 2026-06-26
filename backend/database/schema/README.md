# Database schema (fresh-setup baseline)

`000_baseline_schema.sql` is a **consolidated baseline** that builds the entire Spoon
schema from scratch. It exists because the repo's migrations alone cannot build a
working DB — the base `orders`, `menu_items`, `push_subscriptions` tables and the
`assign_prepared_slot_atomic` function only ever existed in the live Supabase project
(`schema_dump_final.sql` is empty).

## Use it for
- Standing up a **fresh local / staging** database (e.g. a new Supabase project or a
  local Postgres) that mirrors production structure.

## Do NOT use it for
- **Running against production.** It is a baseline, not a migration. The live DB
  already has this schema. Applying DDL to prod is out of scope and risky.

## Fidelity notes
- **Tables & columns** — from live introspection (2026-06-27), cross-checked vs migrations.
- **`confirm_payment_and_order`, `checkout_with_wallet`, `wallet_credit_coins`** — copied
  verbatim from the migrations in `backend/migrations/` (authoritative).
- **`assign_prepared_slot_atomic`** — RECONSTRUCTED from its call site + behavior (no
  source exists anywhere in the repo). Before relying on it, replace it with the real
  definition from production:
  ```sql
  SELECT pg_get_functiondef('public.assign_prepared_slot_atomic'::regproc);
  ```
- **RLS policies & realtime publication** are intentionally omitted — configure per
  environment (see the note at the bottom of the SQL file and `PROJECT_NOTES.md` §3).

## The ideal long-term fix
Generate an authoritative dump straight from the live DB and commit it as the baseline:
```bash
supabase db dump --schema public > backend/database/schema/000_baseline_schema.sql
```
Then keep all future changes as ordered, append-only migration files.

> Verify this baseline on a throwaway Postgres/Supabase instance before trusting it.
