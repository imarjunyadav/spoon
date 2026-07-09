-- Migration: Fix race condition in confirm_payment_and_order
-- Description: Catches unique_violation (23505) so that when both the frontend
--   verify-payment path and the Razorpay webhook path call this RPC concurrently,
--   the loser gracefully returns {success:true, duplicate:true} instead of crashing
--   with "duplicate key value violates unique constraint".
-- Date: 2026-07-10
-- Safe to run: YES (CREATE OR REPLACE, idempotent)

CREATE OR REPLACE FUNCTION public.confirm_payment_and_order(
  p_payment_id TEXT, p_order_id TEXT, p_signature TEXT, p_amount INTEGER,
  p_currency TEXT, p_user_email TEXT, p_items JSONB, p_phone TEXT
) RETURNS JSONB AS $$
DECLARE
  v_existing_order TEXT;
BEGIN
  SELECT order_id INTO v_existing_order
  FROM public.payment_transactions
  WHERE razorpay_payment_id = p_payment_id
  FOR UPDATE;

  IF v_existing_order IS NOT NULL THEN
    RETURN jsonb_build_object('success', true, 'duplicate', true, 'orderId', v_existing_order,
                              'message', 'Payment already processed');
  END IF;

  INSERT INTO public.payment_transactions (
    razorpay_payment_id, razorpay_order_id, razorpay_signature,
    amount, currency, status, user_email, webhook_received, webhook_timestamp, signature_verified
  ) VALUES (
    p_payment_id, p_order_id, p_signature, p_amount, p_currency, 'success', p_user_email, true, now(), true
  );

  INSERT INTO public.orders (
    id, customer_email, total, items, status, phone_number, razorpay_payment_id, created_at
  ) VALUES (
    p_payment_id, p_user_email, (p_amount / 100.0), p_items, 'pending', p_phone, p_payment_id, now()
  );

  RETURN jsonb_build_object('success', true, 'duplicate', false, 'orderId', p_payment_id);
EXCEPTION
  WHEN unique_violation THEN
    -- Race condition: the other path committed the same payment_id first.
    -- Look up the order it created and return success (idempotent).
    SELECT order_id INTO v_existing_order
    FROM public.payment_transactions
    WHERE razorpay_payment_id = p_payment_id;
    RETURN jsonb_build_object('success', true, 'duplicate', true, 'orderId', v_existing_order,
                              'message', 'Payment already processed (race resolved)');
  WHEN OTHERS THEN
    RAISE;
END;
$$ LANGUAGE plpgsql;
