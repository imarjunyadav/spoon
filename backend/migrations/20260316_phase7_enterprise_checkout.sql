-- =============================================================================
-- SPOON v2 — Database Schema Migration (Phase 7 Enterprise Checkout)
-- File:    20260316_phase7_enterprise_checkout.sql
-- Date:    2026-03-16
--
-- PURPOSE
--   Create the foundation for ACID-compliant checkouts, idempotent webhooks,
--   and stock reservation (locking) to prevent overselling.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. ADD STOCK QUANTITY TO MENU ITEMS
-- -----------------------------------------------------------------------------
ALTER TABLE public.menu_items 
ADD COLUMN IF NOT EXISTS quantity_available INTEGER DEFAULT 50;

-- -----------------------------------------------------------------------------
-- 2. CREATE STOCK RESERVATIONS TABLE
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.stock_reservations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_email TEXT NOT NULL,
    items JSONB NOT NULL, -- Array of { id, quantity, price }
    total_amount NUMERIC NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending', -- 'pending', 'confirmed', 'expired'
    razorpay_order_id TEXT,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- Index for cron jobs to quickly find and expire stale reservations
CREATE INDEX IF NOT EXISTS idx_stock_res_expires 
ON public.stock_reservations(expires_at) 
WHERE status = 'pending';

-- -----------------------------------------------------------------------------
-- 3. ATOMIC CHECKOUT RPC (PostgreSQL Stored Procedure)
-- -----------------------------------------------------------------------------
-- Combines idempotency checks, payment logging, and order creation into a 
-- single ACID-compliant database transaction. If any step fails, everything
-- rolls back, preventing orphaned payments.
CREATE OR REPLACE FUNCTION confirm_payment_and_order(
  p_payment_id TEXT,
  p_order_id TEXT,
  p_signature TEXT,
  p_amount INTEGER,
  p_currency TEXT,
  p_user_email TEXT,
  p_items JSONB,
  p_phone TEXT,
  p_reservation_id UUID DEFAULT NULL
) RETURNS JSONB AS $$
DECLARE
  v_existing_order TEXT;
  v_item JSONB;
  v_item_id VARCHAR;
  v_item_qty INTEGER;
BEGIN
  -- A. Idempotency Check: Lock row if it exists
  SELECT order_id INTO v_existing_order 
  FROM public.payment_transactions 
  WHERE razorpay_payment_id = p_payment_id 
  FOR UPDATE;

  -- B. Return immediately if already processed
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

  -- E. Mark Reservation as Confirmed (if used in Phase 7 Step 3)
  IF p_reservation_id IS NOT NULL THEN
     UPDATE public.stock_reservations 
     SET status = 'confirmed' 
     WHERE id = p_reservation_id;
  END IF;

  -- F. Permanently Deduct Actual Stock
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    v_item_id := v_item->>'id';
    v_item_qty := (v_item->>'quantity')::INTEGER;

    UPDATE public.menu_items 
    SET quantity_available = quantity_available - v_item_qty
    WHERE id::text = v_item_id;
  END LOOP;

  -- G. Return Success
  RETURN jsonb_build_object(
      'success', true, 
      'duplicate', false, 
      'orderId', p_payment_id
  );
EXCEPTION WHEN OTHERS THEN
  -- Let Postgres natively rollback the entire transaction on error
  RAISE;
END;
$$ LANGUAGE plpgsql;

-- -----------------------------------------------------------------------------
-- SECURE RLS
-- -----------------------------------------------------------------------------
ALTER TABLE public.stock_reservations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can insert their own reservations" 
ON public.stock_reservations FOR INSERT 
WITH CHECK (auth.jwt() ->> 'email' = user_email);

CREATE POLICY "Users can view their own reservations" 
ON public.stock_reservations FOR SELECT 
USING (auth.jwt() ->> 'email' = user_email);
