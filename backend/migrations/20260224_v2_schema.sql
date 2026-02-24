-- =============================================================================
-- SPOON v2 — Database Schema Migration
-- File:    20260224_v2_schema.sql
-- Phase:   0 — DB Schema Only
-- Author:  SPOON Engineering
-- Date:    2026-02-24
--
-- PURPOSE
--   Migrate the `orders` table and supporting schema from v1 (uppercase status
--   values, no slot/audit columns) to v2 (slot-based counter queue system).
--
-- SAFETY
--   • This file is fully idempotent — safe to re-run after a partial failure.
--   • All DDL uses IF NOT EXISTS / IF EXISTS.
--   • CHECK constraint is dropped before re-adding (H3 fix).
--   • Each section is separated so it can be run independently if needed.
--
-- PRE-REQUISITES
--   1. No active orders in transitional states (see R1 pre-validation below).
--   2. DB backup taken and timestamp recorded.
--   3. Server / Cloud Run scaled to 0 (maintenance mode active).
--
-- EXECUTION ORDER
--   Run sections A → B → C → D → E → F → G in order.
--   After each section, confirm the output is error-free before proceeding.
-- =============================================================================


-- =============================================================================
-- R1: PRE-VALIDATION
-- Run this block first (as a SELECT). It must return 0 rows before proceeding.
-- If any rows are returned, resolve them manually before running the rest.
-- =============================================================================

-- Uncomment and run to verify — do NOT skip this step in production.
/*
SELECT status, COUNT(*) AS row_count
FROM public.orders
WHERE status NOT IN (
  'PLACED', 'PREPARING', 'COMPLETE', 'PICKED_UP', 'CANCELLED',  -- v1 values
  'pending', 'kitchen', 'prepared', 'completed', 'cancelled'     -- v2 values (safe if partially migrated)
)
GROUP BY status;
-- Expected: 0 rows returned.
-- If rows appear: identify unknown status values and resolve before continuing.
*/

-- Also confirm no active (un-collected) orders exist before going to maintenance:
/*
SELECT id, status, customer_email, created_at
FROM public.orders
WHERE status NOT IN ('completed', 'cancelled', 'PICKED_UP', 'CANCELLED')
ORDER BY created_at;
-- Expected: 0 rows. If any rows: notify affected students and resolve first.
*/


-- =============================================================================
-- SECTION A: ADD NEW COLUMNS TO `orders`
-- All use IF NOT EXISTS — fully idempotent.
-- New columns are nullable — no existing rows are affected.
-- =============================================================================

ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS kitchen_at    TIMESTAMPTZ;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS prepared_at   TIMESTAMPTZ;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS completed_at  TIMESTAMPTZ;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS arrived_at    TIMESTAMPTZ;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS cancelled_at  TIMESTAMPTZ;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS slot_number   INTEGER;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS kitchen_by    TEXT;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS prepared_by   TEXT;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS completed_by  TEXT;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS cancelled_by  TEXT;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS cancel_reason TEXT;

-- Expected output: ALTER TABLE (×11), no errors.


-- =============================================================================
-- SECTION B: MIGRATE STATUS VALUES
-- Each UPDATE is targeted — no blanket updates.
-- Where clause ensures only rows with the specific v1 value are changed.
-- Safe to re-run: if already migrated, each UPDATE affects 0 rows.
-- =============================================================================

UPDATE public.orders SET status = 'pending'   WHERE status = 'PLACED';
UPDATE public.orders SET status = 'kitchen'   WHERE status = 'PREPARING';
UPDATE public.orders SET status = 'prepared'  WHERE status = 'COMPLETE';
UPDATE public.orders SET status = 'completed' WHERE status = 'PICKED_UP';
UPDATE public.orders SET status = 'cancelled' WHERE status = 'CANCELLED';

-- Expected output: UPDATE N (N may be 0 for each — that is correct if no rows
-- had that status, or if this section already ran).


-- =============================================================================
-- SECTION C: CHECK CONSTRAINT ON status COLUMN
-- H3 FIX: DROP IF EXISTS before ADD — idempotent on re-run.
-- The DROP is a no-op on first run; the ADD then succeeds cleanly.
-- Without the DROP, a re-run after a partial failure would throw:
--   ERROR: constraint "orders_status_check" already exists
-- =============================================================================

ALTER TABLE public.orders
  DROP CONSTRAINT IF EXISTS orders_status_check;

ALTER TABLE public.orders
  ADD CONSTRAINT orders_status_check
  CHECK (status IN ('pending', 'kitchen', 'prepared', 'completed', 'cancelled'));

-- Expected output: ALTER TABLE (×2), no errors.


-- =============================================================================
-- SECTION D: SLOT NUMBER RANGE CONSTRAINT (R2)
-- Prevents backend bugs from writing garbage values (0, -1, >100) to slot_number.
-- Upper bound of 100 gives room for future capacity increases beyond default 10.
-- slot_number IS NULL is allowed (orders not yet in prepared state have no slot).
-- Idempotent: DROP IF EXISTS before ADD.
-- =============================================================================

ALTER TABLE public.orders
  DROP CONSTRAINT IF EXISTS orders_slot_range_check;

ALTER TABLE public.orders
  ADD CONSTRAINT orders_slot_range_check
  CHECK (slot_number IS NULL OR (slot_number >= 1 AND slot_number <= 100));

-- Expected output: ALTER TABLE (×2), no errors.


-- =============================================================================
-- SECTION E: PARTIAL UNIQUE INDEX FOR SLOT CONCURRENCY SAFETY
-- This is the core concurrency safety mechanism for slot assignment.
-- Only one 'prepared' order can hold a given slot_number at any time.
-- Completed/cancelled orders retain their slot_number for audit but are excluded
-- from the uniqueness constraint (status != 'prepared').
-- CREATE ... IF NOT EXISTS is idempotent.
-- =============================================================================

CREATE UNIQUE INDEX IF NOT EXISTS idx_orders_slot_prepared
  ON public.orders (slot_number)
  WHERE status = 'prepared';

-- Expected output: CREATE INDEX, no errors.


-- =============================================================================
-- SECTION F: system_settings TABLE
-- Stores configurable runtime settings, shared across all admin sessions.
-- Changes are propagated instantly via Supabase Realtime.
-- Uses CREATE TABLE IF NOT EXISTS and ON CONFLICT DO NOTHING — fully idempotent.
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.system_settings (
  key        TEXT        PRIMARY KEY,
  value      TEXT        NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- R3 FIX: Trigger to auto-update updated_at on every UPDATE.
-- Without this, updated_at only reflects INSERT time — audit trail is wrong.
CREATE OR REPLACE FUNCTION update_system_settings_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Drop trigger if already exists (idempotent)
DROP TRIGGER IF EXISTS trg_system_settings_updated_at ON public.system_settings;

CREATE TRIGGER trg_system_settings_updated_at
  BEFORE UPDATE ON public.system_settings
  FOR EACH ROW
  EXECUTE FUNCTION update_system_settings_timestamp();

-- Seed default values
-- ON CONFLICT DO NOTHING: safe to re-run — existing values are preserved.
INSERT INTO public.system_settings (key, value) VALUES
  ('max_prepared_slots',      '10'),
  ('no_show_timeout_minutes', '10')
ON CONFLICT (key) DO NOTHING;

-- Enable Realtime for this table so admin sessions sync instantly
ALTER PUBLICATION supabase_realtime ADD TABLE public.system_settings;

-- Expected output: CREATE TABLE, CREATE FUNCTION, DROP TRIGGER, CREATE TRIGGER,
--                  INSERT 0 2 (or 0 0 on re-run), ALTER PUBLICATION.


-- =============================================================================
-- SECTION G: DROP ORPHANED TABLE
-- kitchen_told_items is unused in v2. Drop it if it exists.
-- IF EXISTS makes this a no-op if already removed.
-- =============================================================================

DROP TABLE IF EXISTS public.kitchen_told_items;

-- Expected output: DROP TABLE, no errors.


-- =============================================================================
-- POST-MIGRATION VERIFICATION
-- Run this block after all sections complete. All 6 checks must pass.
-- =============================================================================

/*
SELECT 'legacy_statuses'         AS check_name,
       COUNT(*) AS result,
       CASE WHEN COUNT(*) = 0 THEN 'PASS' ELSE 'FAIL' END AS status
FROM public.orders
WHERE status IN ('PLACED', 'PREPARING', 'COMPLETE', 'PICKED_UP')

UNION ALL

SELECT 'settings_rows',
       COUNT(*),
       CASE WHEN COUNT(*) = 2 THEN 'PASS' ELSE 'FAIL' END
FROM public.system_settings

UNION ALL

SELECT 'new_columns',
       COUNT(*),
       CASE WHEN COUNT(*) = 11 THEN 'PASS' ELSE 'FAIL' END
FROM information_schema.columns
WHERE table_name = 'orders'
  AND column_name IN (
    'kitchen_at', 'prepared_at', 'completed_at', 'arrived_at',
    'cancelled_at', 'slot_number', 'kitchen_by', 'prepared_by',
    'completed_by', 'cancelled_by', 'cancel_reason'
  )

UNION ALL

SELECT 'slot_index',
       COUNT(*),
       CASE WHEN COUNT(*) = 1 THEN 'PASS' ELSE 'FAIL' END
FROM pg_indexes
WHERE tablename = 'orders' AND indexname = 'idx_orders_slot_prepared'

UNION ALL

SELECT 'status_check_constraint',
       COUNT(*),
       CASE WHEN COUNT(*) = 1 THEN 'PASS' ELSE 'FAIL' END
FROM pg_constraint
WHERE conrelid = 'public.orders'::regclass
  AND conname = 'orders_status_check'

UNION ALL

SELECT 'settings_values_correct',
       COUNT(*) FILTER (
         WHERE (key = 'max_prepared_slots'      AND value = '10')
            OR (key = 'no_show_timeout_minutes' AND value = '10')
       ),
       CASE WHEN COUNT(*) FILTER (
         WHERE (key = 'max_prepared_slots'      AND value = '10')
            OR (key = 'no_show_timeout_minutes' AND value = '10')
       ) = 2 THEN 'PASS' ELSE 'FAIL' END
FROM public.system_settings;

-- Expected results:
-- check_name                | result | status
-- --------------------------|--------|-------
-- legacy_statuses           |      0 | PASS
-- settings_rows             |      2 | PASS
-- new_columns               |     11 | PASS
-- slot_index                |      1 | PASS
-- status_check_constraint   |      1 | PASS
-- settings_values_correct   |      2 | PASS
--
-- Any FAIL = do NOT bring the server back up. Diagnose first.
*/
