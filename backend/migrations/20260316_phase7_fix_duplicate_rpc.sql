-- =============================================================================
-- Fix: Drop the OLD 9-parameter version of confirm_payment_and_order
-- The v1 script created a version with p_reservation_id UUID parameter.
-- The v2 script's CREATE OR REPLACE only replaces same-signature functions,
-- so Postgres now has TWO versions causing ambiguity errors.
-- =============================================================================

-- Drop the OLD 9-param version (with p_reservation_id)
DROP FUNCTION IF EXISTS public.confirm_payment_and_order(
  TEXT, TEXT, TEXT, INTEGER, TEXT, TEXT, JSONB, TEXT, UUID
);

-- The 8-param version from v2 script remains untouched and will work correctly.
