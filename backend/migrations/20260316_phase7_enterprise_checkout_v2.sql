-- =============================================================================
-- SPOON v2 — Schema Cleanup & Simplified Atomic Checkout (Phase 7 - v2)
-- Date:    2026-03-16
--
-- PURPOSE
--   1. Rollback the unused `quantity_available` and `stock_reservations` 
--      that were added in the previous script.
--   2. Replace the RPC with a simpler, cleaner version that focuses ONLY on
--      ACID Database Atomicity (preventing orphaned payments).
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. ROLLBACK UNUSED COMPLEXITY
-- -----------------------------------------------------------------------------
-- Remove the numerical quantity column since we use simple ON/OFF toggles
ALTER TABLE public.menu_items 
DROP COLUMN IF EXISTS quantity_available;

-- Remove the reservations table, as reservations don't apply to ON/OFF toggles
DROP TABLE IF EXISTS public.stock_reservations CASCADE;

-- -----------------------------------------------------------------------------
-- 2. SIMPLIFIED ATOMIC CHECKOUT RPC
-- -----------------------------------------------------------------------------
-- This provides the critical enterprise safety (no orphaned payments) without
-- the overhead of inventory math. Payment logging and Order creation happen
-- in one indivisible transaction.
CREATE OR REPLACE FUNCTION confirm_payment_and_order(
  p_payment_id TEXT,
  p_order_id TEXT,
  p_signature TEXT,
  p_amount INTEGER,
  p_currency TEXT,
  p_user_email TEXT,
  p_items JSONB,
  p_phone TEXT
) RETURNS JSONB AS $$
DECLARE
  v_existing_order TEXT;
BEGIN
  -- A. Idempotency Check: Lock row if it exists to prevent double-processing
  SELECT order_id INTO v_existing_order 
  FROM public.payment_transactions 
  WHERE razorpay_payment_id = p_payment_id 
  FOR UPDATE;

  -- B. Return immediately if already processed (Webhook hit us twice)
  IF v_existing_order IS NOT NULL THEN
    RETURN jsonb_build_object(
        'success', true, 
        'duplicate', true, 
        'orderId', v_existing_order,
        'message', 'Payment already processed'
    );
  END IF;

  -- C. Log Payment Transaction
  INSERT INTO public.payment_transactions (
    razorpay_payment_id, razorpay_order_id, razorpay_signature, 
    amount, currency, status, user_email, webhook_received, 
    webhook_timestamp, signature_verified
  ) VALUES (
    p_payment_id, p_order_id, p_signature, 
    p_amount, p_currency, 'success', p_user_email, true, 
    now(), true
  );

  -- D. Create The Food Order
  INSERT INTO public.orders (
    id, customer_email, total, items, status, phone_number, 
    razorpay_payment_id, created_at
  ) VALUES (
    p_payment_id, p_user_email, (p_amount / 100.0), p_items, 'pending', p_phone,
    p_payment_id, now()
  );

  -- E. Return Success
  RETURN jsonb_build_object(
      'success', true, 
      'duplicate', false, 
      'orderId', p_payment_id
  );
EXCEPTION WHEN OTHERS THEN
  -- Let Postgres natively rollback the entire transaction on any failure
  RAISE;
END;
$$ LANGUAGE plpgsql;
