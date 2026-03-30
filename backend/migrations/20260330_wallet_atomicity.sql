-- =============================================================================
-- SPOON v2 — Wallet Flow Atomicity Migration
-- Date:    2026-03-30
--
-- PURPOSE
--   1. Converts the fragile multi-step Node.js wallet checkout into a single 
--      ACID Stored Procedure.
--   2. Prevents catastrophic edge cases where a Node server crash deducts
--      a balance but fails to create the order.
--   3. Introduces Idempotency checks to prevent double-charging on network retry.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. ATOMIC WALLET CHECKOUT RPC
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.checkout_with_wallet(
  p_order_id TEXT,
  p_email TEXT,
  p_amount INTEGER,
  p_items JSONB,
  p_phone TEXT,
  p_verification_code TEXT
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_wallet_id UUID;
  v_current_balance INTEGER;
  v_new_balance INTEGER;
  v_existing_order TEXT;
BEGIN
  -- A. Idempotency Check (Has this specific network request already been processed?)
  -- If the client retried the exact same POST payload, we just return success.
  SELECT id INTO v_existing_order 
  FROM public.orders 
  WHERE id = p_order_id;
  
  IF v_existing_order IS NOT NULL THEN
    RETURN jsonb_build_object(
      'success', true, 
      'duplicate', true, 
      'orderId', v_existing_order,
      'message', 'Order already processed'
    );
  END IF;

  -- B. Lock the wallet row FOR UPDATE to prevent concurrent modifications
  SELECT id, balance INTO v_wallet_id, v_current_balance
  FROM public.wallets
  WHERE user_email = p_email
  FOR UPDATE;

  -- C. Validate Wallet Existence & Balance
  IF v_wallet_id IS NULL THEN
    RAISE EXCEPTION 'WALLET_NOT_FOUND';
  END IF;
  
  IF v_current_balance < p_amount THEN
    RAISE EXCEPTION 'INSUFFICIENT_BALANCE: Req %, Has %', p_amount, v_current_balance;
  END IF;

  -- D. Calculate New Balance
  v_new_balance := v_current_balance - p_amount;

  -- E. Deduct Balance
  UPDATE public.wallets 
  SET balance = v_new_balance, updated_at = now()
  WHERE id = v_wallet_id;

  -- F. Create Wallet Transaction Ledger
  INSERT INTO public.wallet_transactions (
    wallet_id, type, amount, reason, reference_order_id, description, balance_after
  ) VALUES (
    v_wallet_id, 'DEBIT', p_amount, 'PURCHASE', p_order_id, 
    'Order payment: -' || p_amount || ' coins', v_new_balance
  );

  -- G. Create The Food Order
  INSERT INTO public.orders (
    id, customer_email, total, items, status, phone_number, 
    payment_method, verification_code, created_at
  ) VALUES (
    p_order_id, p_email, (p_amount / 1.0), p_items, 'pending', p_phone, 
    'WALLET', p_verification_code, now()
  );

  -- H. Return Success
  RETURN jsonb_build_object(
    'success', true, 
    'duplicate', false, 
    'orderId', p_order_id,
    'coinsUsed', p_amount,
    'remainingBalance', v_new_balance
  );

EXCEPTION WHEN OTHERS THEN
  -- Let Postgres natively rollback the entire block on any failure
  RAISE;
END;
$$;


-- -----------------------------------------------------------------------------
-- 2. ATOMIC WALLET CREDIT RPC (For Refunds and Admin Tops)
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.wallet_credit_coins(
  p_email TEXT,
  p_amount INTEGER,
  p_reason TEXT,
  p_order_id TEXT,
  p_description TEXT
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_wallet_id UUID;
  v_current_balance INTEGER;
  v_new_balance INTEGER;
  v_existing_refund UUID;
BEGIN
  -- A. Idempotency Check for Refunds
  IF p_reason = 'REFUND' AND p_order_id IS NOT NULL THEN
    SELECT id INTO v_existing_refund
    FROM public.wallet_transactions
    WHERE reference_order_id = p_order_id AND reason = 'REFUND'
    LIMIT 1;

    IF v_existing_refund IS NOT NULL THEN
      -- Already refunded, calculate balance independently
      SELECT balance INTO v_current_balance FROM public.wallets WHERE user_email = p_email;
      
      RETURN jsonb_build_object(
        'success', true, 
        'duplicate', true, 
        'balance', COALESCE(v_current_balance, 0),
        'message', 'Refund already processed'
      );
    END IF;
  END IF;

  -- B. Get or Create Wallet, locking it FOR UPDATE
  -- We attempt to select and lock. If not found, insert, then lock.
  SELECT id, balance INTO v_wallet_id, v_current_balance
  FROM public.wallets
  WHERE user_email = p_email
  FOR UPDATE;

  IF v_wallet_id IS NULL THEN
    INSERT INTO public.wallets (user_email, balance)
    VALUES (p_email, 0)
    RETURNING id, balance INTO v_wallet_id, v_current_balance;
  END IF;

  -- C. Add to Balance
  v_new_balance := v_current_balance + p_amount;

  UPDATE public.wallets 
  SET balance = v_new_balance, updated_at = now()
  WHERE id = v_wallet_id;

  -- D. Create Transaction Ledger
  INSERT INTO public.wallet_transactions (
    wallet_id, type, amount, reason, reference_order_id, description, balance_after
  ) VALUES (
    v_wallet_id, 'CREDIT', p_amount, p_reason, p_order_id, 
    COALESCE(p_description, p_reason || ': +' || p_amount || ' coins'), 
    v_new_balance
  );

  RETURN jsonb_build_object(
    'success', true, 
    'duplicate', false, 
    'balance', v_new_balance
  );
EXCEPTION WHEN OTHERS THEN
  RAISE;
END;
$$;
