-- =============================================================================
-- SPOON — CONSOLIDATED BASELINE SCHEMA (for FRESH setups only)
-- Generated: 2026-06-27
--
-- WHY THIS FILE EXISTS
--   The repo's migrations do not, by themselves, build a working database:
--   the base `orders`, `menu_items`, and `push_subscriptions` tables and the
--   `assign_prepared_slot_atomic` function exist ONLY in the live Supabase DB
--   (no SQL file ever created them). `schema_dump_final.sql` is empty.
--   This file consolidates the full schema so a brand-new environment
--   (local / staging) can be stood up from scratch.
--
-- SOURCE OF TRUTH / FIDELITY
--   - Table columns + types: taken from LIVE introspection (2026-06-27) of the
--     production Supabase project, cross-checked against the migrations.
--   - confirm_payment_and_order / checkout_with_wallet / wallet_credit_coins:
--     copied VERBATIM from the existing migrations (authoritative).
--   - assign_prepared_slot_atomic: RECONSTRUCTED from its call site + documented
--     behavior (no source exists in the repo). It matches the observed contract,
--     but BEFORE relying on it you should replace it with the authoritative live
--     definition:
--         SELECT pg_get_functiondef('public.assign_prepared_slot_atomic'::regproc);
--     (run in the Supabase SQL editor against production, then paste here).
--
-- ⚠️  DO NOT RUN THIS AGAINST PRODUCTION. It is a fresh-setup baseline, not a
--     migration. Running it on the live DB is unnecessary and risky.
--     The preferred way to regenerate an authoritative baseline is:
--         supabase db dump --schema public > baseline.sql
-- =============================================================================

-- Extensions (uuid generation)
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- -----------------------------------------------------------------------------
-- Shared trigger function: keep updated_at fresh
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- =============================================================================
-- TABLES
-- =============================================================================

-- users -----------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.users (
  email                TEXT PRIMARY KEY,
  name                 TEXT NOT NULL,
  is_admin             BOOLEAN DEFAULT false,
  active_session_token UUID DEFAULT NULL,   -- student session (custom header auth)
  session_created_at   TIMESTAMPTZ DEFAULT NULL,
  admin_session_token  UUID DEFAULT NULL,   -- legacy; admin auth now uses Supabase JWT only
  created_at           TIMESTAMPTZ DEFAULT NOW(),
  updated_at           TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_users_is_admin ON public.users (is_admin) WHERE is_admin = true;
CREATE INDEX IF NOT EXISTS idx_users_active_session ON public.users (email, active_session_token);
DROP TRIGGER IF EXISTS trigger_users_updated_at ON public.users;
CREATE TRIGGER trigger_users_updated_at BEFORE UPDATE ON public.users
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- menu_items ------------------------------------------------------------------
-- Stock is a simple ON/OFF toggle (is_available), NOT a numeric inventory count.
-- price is whole rupees (integer).
CREATE TABLE IF NOT EXISTS public.menu_items (
  id           INTEGER PRIMARY KEY,
  name         TEXT NOT NULL,
  category     TEXT,
  category_id  TEXT,
  price        INTEGER NOT NULL,
  is_available BOOLEAN NOT NULL DEFAULT true
);

-- orders ----------------------------------------------------------------------
-- id = Razorpay payment id (card orders) OR 'wallet_<ts>_<rand>' (wallet orders).
CREATE TABLE IF NOT EXISTS public.orders (
  id                  TEXT PRIMARY KEY,
  status              TEXT NOT NULL DEFAULT 'pending',
  total               NUMERIC NOT NULL,
  items               JSONB,
  customer_email      TEXT,
  phone_number        TEXT,
  verification_code   TEXT,
  payment_method      TEXT DEFAULT 'RAZORPAY',   -- 'RAZORPAY' | 'WALLET'
  razorpay_payment_id TEXT,
  -- v2 slot/audit columns
  slot_number         INTEGER,
  kitchen_at          TIMESTAMPTZ,
  prepared_at         TIMESTAMPTZ,
  completed_at        TIMESTAMPTZ,
  arrived_at          TIMESTAMPTZ,
  cancelled_at        TIMESTAMPTZ,
  kitchen_by          TEXT,
  prepared_by         TEXT,
  completed_by        TEXT,
  cancelled_by        TEXT,
  cancel_reason       TEXT,
  refund_amount       INTEGER,
  is_acknowledged     BOOLEAN DEFAULT false,     -- admin audio-alert acknowledgement
  -- DEPRECATED / ARCHIVED v1 columns — intentionally retained (old pre-order
  -- cancellation flow). Do NOT delete; may be reused when pre-orders go live.
  preorder_time       TIMESTAMPTZ,               -- v1: scheduled pre-order time (flow not active)
  ready_at            TIMESTAMPTZ,               -- v1: superseded by prepared_at
  picked_up_at        TIMESTAMPTZ,               -- v1: superseded by completed_at
  cancellation_reason TEXT,                      -- v1: superseded by cancel_reason
  created_at          TIMESTAMPTZ DEFAULT NOW(),
  updated_at          TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT orders_status_check CHECK (status IN ('pending','kitchen','prepared','completed','cancelled')),
  CONSTRAINT orders_slot_range_check CHECK (slot_number IS NULL OR (slot_number BETWEEN 1 AND 100))
);
-- Core slot-concurrency guard: at most one prepared order per slot at a time.
CREATE UNIQUE INDEX IF NOT EXISTS idx_orders_slot_prepared
  ON public.orders (slot_number) WHERE status = 'prepared';

COMMENT ON COLUMN public.orders.preorder_time       IS 'DEPRECATED (v1 pre-order flow, not active). Retained for possible future reuse.';
COMMENT ON COLUMN public.orders.ready_at            IS 'DEPRECATED (v1). Superseded by prepared_at.';
COMMENT ON COLUMN public.orders.picked_up_at        IS 'DEPRECATED (v1). Superseded by completed_at.';
COMMENT ON COLUMN public.orders.cancellation_reason IS 'DEPRECATED (v1). Superseded by cancel_reason.';

-- payment_transactions --------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.payment_transactions (
  id                  SERIAL PRIMARY KEY,
  razorpay_payment_id TEXT UNIQUE NOT NULL,           -- idempotency key
  razorpay_order_id   TEXT NOT NULL,
  razorpay_signature  TEXT,
  amount              INTEGER NOT NULL CHECK (amount > 0),   -- paise
  currency            TEXT NOT NULL DEFAULT 'INR' CHECK (currency IN ('INR','USD','EUR','GBP')),
  status              TEXT NOT NULL DEFAULT 'initiated'
                        CHECK (status IN ('initiated','processing','success','failed','abandoned')),
  user_email          TEXT REFERENCES public.users(email) ON DELETE SET NULL,
  order_id            TEXT,
  webhook_received    BOOLEAN DEFAULT false,
  webhook_timestamp   TIMESTAMPTZ,
  signature_verified  BOOLEAN DEFAULT false,
  error_reason        TEXT,
  created_at          TIMESTAMPTZ DEFAULT NOW(),
  updated_at          TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_payment_tx_payment_id ON public.payment_transactions (razorpay_payment_id);
CREATE INDEX IF NOT EXISTS idx_payment_tx_order_id   ON public.payment_transactions (razorpay_order_id);
CREATE INDEX IF NOT EXISTS idx_payment_tx_user       ON public.payment_transactions (user_email);
CREATE INDEX IF NOT EXISTS idx_payment_tx_status     ON public.payment_transactions (status);
CREATE INDEX IF NOT EXISTS idx_payment_tx_created    ON public.payment_transactions (created_at DESC);
DROP TRIGGER IF EXISTS trigger_payment_transactions_updated_at ON public.payment_transactions;
CREATE TRIGGER trigger_payment_transactions_updated_at BEFORE UPDATE ON public.payment_transactions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- wallets ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.wallets (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_email  TEXT NOT NULL UNIQUE,
  balance     INTEGER NOT NULL DEFAULT 0 CONSTRAINT balance_non_negative CHECK (balance >= 0),
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_wallets_user_email ON public.wallets (user_email);

-- wallet_transactions (immutable ledger) --------------------------------------
CREATE TABLE IF NOT EXISTS public.wallet_transactions (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  wallet_id          UUID NOT NULL REFERENCES public.wallets(id),
  type               TEXT NOT NULL CHECK (type IN ('CREDIT','DEBIT')),
  amount             INTEGER NOT NULL CHECK (amount > 0),
  reason             TEXT NOT NULL CHECK (reason IN ('REFUND','PURCHASE','ADMIN_CREDIT','ADMIN_DEBIT')),
  reference_order_id TEXT,
  description        TEXT,
  balance_after      INTEGER NOT NULL,
  created_at         TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_wallet_txn_wallet_id ON public.wallet_transactions (wallet_id);
CREATE INDEX IF NOT EXISTS idx_wallet_txn_reference ON public.wallet_transactions (reference_order_id);

-- system_settings -------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.system_settings (
  key        TEXT PRIMARY KEY,
  value      TEXT NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
DROP TRIGGER IF EXISTS trg_system_settings_updated_at ON public.system_settings;
CREATE TRIGGER trg_system_settings_updated_at BEFORE UPDATE ON public.system_settings
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
INSERT INTO public.system_settings (key, value) VALUES
  ('max_prepared_slots', '8'),
  ('no_show_timeout_minutes', '15'),
  ('is_break_time', 'false')
ON CONFLICT (key) DO NOTHING;

-- push_subscriptions ----------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.push_subscriptions (
  id         BIGINT GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  user_email TEXT,
  endpoint   TEXT UNIQUE NOT NULL,
  keys       JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- =============================================================================
-- RPC FUNCTIONS
-- =============================================================================

-- confirm_payment_and_order — VERBATIM from 20260316_phase7_enterprise_checkout_v2.sql
CREATE OR REPLACE FUNCTION public.confirm_payment_and_order(
  p_payment_id TEXT, p_order_id TEXT, p_signature TEXT, p_amount INTEGER,
  p_currency TEXT, p_user_email TEXT, p_items JSONB, p_phone TEXT
) RETURNS JSONB AS $$
DECLARE
  v_exists BOOLEAN;
BEGIN
  SELECT true INTO v_exists
  FROM public.payment_transactions
  WHERE razorpay_payment_id = p_payment_id
  FOR UPDATE;

  IF v_exists THEN
    RETURN jsonb_build_object('success', true, 'duplicate', true, 'orderId', p_payment_id,
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
    -- We know the order ID is the payment ID, so we return it directly.
    RETURN jsonb_build_object('success', true, 'duplicate', true, 'orderId', p_payment_id,
                              'message', 'Payment already processed (race resolved)');
  WHEN OTHERS THEN
    RAISE;
END;
$$ LANGUAGE plpgsql;

-- checkout_with_wallet — VERBATIM from 20260330_wallet_atomicity.sql
CREATE OR REPLACE FUNCTION public.checkout_with_wallet(
  p_order_id TEXT, p_email TEXT, p_amount INTEGER, p_items JSONB, p_phone TEXT, p_verification_code TEXT
) RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_wallet_id UUID;
  v_current_balance INTEGER;
  v_new_balance INTEGER;
  v_existing_order TEXT;
BEGIN
  SELECT id INTO v_existing_order FROM public.orders WHERE id = p_order_id;
  IF v_existing_order IS NOT NULL THEN
    RETURN jsonb_build_object('success', true, 'duplicate', true, 'orderId', v_existing_order,
                              'message', 'Order already processed');
  END IF;

  SELECT id, balance INTO v_wallet_id, v_current_balance
  FROM public.wallets WHERE user_email = p_email FOR UPDATE;

  IF v_wallet_id IS NULL THEN RAISE EXCEPTION 'WALLET_NOT_FOUND'; END IF;
  IF v_current_balance < p_amount THEN
    RAISE EXCEPTION 'INSUFFICIENT_BALANCE: Req %, Has %', p_amount, v_current_balance;
  END IF;

  v_new_balance := v_current_balance - p_amount;
  UPDATE public.wallets SET balance = v_new_balance, updated_at = now() WHERE id = v_wallet_id;

  INSERT INTO public.wallet_transactions (
    wallet_id, type, amount, reason, reference_order_id, description, balance_after
  ) VALUES (
    v_wallet_id, 'DEBIT', p_amount, 'PURCHASE', p_order_id, 'Order payment: -' || p_amount || ' coins', v_new_balance
  );

  INSERT INTO public.orders (
    id, customer_email, total, items, status, phone_number, payment_method, verification_code, created_at
  ) VALUES (
    p_order_id, p_email, (p_amount / 1.0), p_items, 'pending', p_phone, 'WALLET', p_verification_code, now()
  );

  RETURN jsonb_build_object('success', true, 'duplicate', false, 'orderId', p_order_id,
                            'coinsUsed', p_amount, 'remainingBalance', v_new_balance);
EXCEPTION WHEN OTHERS THEN
  RAISE;
END;
$$;

-- wallet_credit_coins — VERBATIM from 20260330_wallet_atomicity.sql
CREATE OR REPLACE FUNCTION public.wallet_credit_coins(
  p_email TEXT, p_amount INTEGER, p_reason TEXT, p_order_id TEXT, p_description TEXT
) RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_wallet_id UUID;
  v_current_balance INTEGER;
  v_new_balance INTEGER;
  v_existing_refund UUID;
BEGIN
  IF p_reason = 'REFUND' AND p_order_id IS NOT NULL THEN
    SELECT id INTO v_existing_refund FROM public.wallet_transactions
    WHERE reference_order_id = p_order_id AND reason = 'REFUND' LIMIT 1;
    IF v_existing_refund IS NOT NULL THEN
      SELECT balance INTO v_current_balance FROM public.wallets WHERE user_email = p_email;
      RETURN jsonb_build_object('success', true, 'duplicate', true, 'balance', COALESCE(v_current_balance, 0),
                                'message', 'Refund already processed');
    END IF;
  END IF;

  SELECT id, balance INTO v_wallet_id, v_current_balance
  FROM public.wallets WHERE user_email = p_email FOR UPDATE;

  IF v_wallet_id IS NULL THEN
    INSERT INTO public.wallets (user_email, balance) VALUES (p_email, 0)
    RETURNING id, balance INTO v_wallet_id, v_current_balance;
  END IF;

  v_new_balance := v_current_balance + p_amount;
  UPDATE public.wallets SET balance = v_new_balance, updated_at = now() WHERE id = v_wallet_id;

  INSERT INTO public.wallet_transactions (
    wallet_id, type, amount, reason, reference_order_id, description, balance_after
  ) VALUES (
    v_wallet_id, 'CREDIT', p_amount, p_reason, p_order_id,
    COALESCE(p_description, p_reason || ': +' || p_amount || ' coins'), v_new_balance
  );

  RETURN jsonb_build_object('success', true, 'duplicate', false, 'balance', v_new_balance);
EXCEPTION WHEN OTHERS THEN
  RAISE;
END;
$$;

-- assign_prepared_slot_atomic — ⚠️ RECONSTRUCTED (no source in repo).
-- Matches the observed contract used by backend/routes/orders.js:
--   rpc('assign_prepared_slot_atomic', { p_order_id, p_max_slots, p_admin_email })
--   consumes: success, slot, order, error, code
-- REPLACE with the authoritative live definition before production use:
--   SELECT pg_get_functiondef('public.assign_prepared_slot_atomic'::regproc);
CREATE OR REPLACE FUNCTION public.assign_prepared_slot_atomic(
  p_order_id TEXT, p_max_slots INTEGER, p_admin_email TEXT
) RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_status TEXT;
  v_slot INTEGER;
  v_order public.orders;
BEGIN
  SELECT status INTO v_status FROM public.orders WHERE id = p_order_id FOR UPDATE;
  IF v_status IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Order not found', 'code', 'NOT_FOUND');
  END IF;
  IF v_status <> 'kitchen' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Order not in kitchen state', 'code', 'STATE_CONFLICT');
  END IF;

  SELECT s.n INTO v_slot
  FROM generate_series(1, p_max_slots) AS s(n)
  WHERE NOT EXISTS (
    SELECT 1 FROM public.orders o WHERE o.status = 'prepared' AND o.slot_number = s.n
  )
  ORDER BY s.n LIMIT 1;

  IF v_slot IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'All prepared slots are full', 'code', 'CAPACITY_FULL');
  END IF;

  UPDATE public.orders
  SET status = 'prepared', slot_number = v_slot, prepared_at = now(), prepared_by = p_admin_email
  WHERE id = p_order_id
  RETURNING * INTO v_order;

  RETURN jsonb_build_object('success', true, 'slot', v_slot, 'order', to_jsonb(v_order));
EXCEPTION
  WHEN unique_violation THEN
    RETURN jsonb_build_object('success', false, 'error', 'Slot just taken, retry', 'code', 'SLOT_RACE');
  WHEN OTHERS THEN
    RAISE;
END;
$$;

-- =============================================================================
-- NOTE: RLS policies and realtime publication membership are intentionally NOT
-- included here — configure them per environment. In production:
--   RLS enabled on: users, payment_transactions, wallets, wallet_transactions
--   Realtime publication: users, system_settings, orders, menu_items
-- =============================================================================
