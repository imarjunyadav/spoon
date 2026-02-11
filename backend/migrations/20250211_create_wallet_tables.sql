-- ========================================
-- eWallet: Wallets + Transactions + Orders Update
-- ========================================

-- 1. Create wallets table
CREATE TABLE IF NOT EXISTS public.wallets (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_email TEXT NOT NULL UNIQUE,
  balance INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  CONSTRAINT balance_non_negative CHECK (balance >= 0)
);

-- 2. Create wallet_transactions table (immutable ledger)
CREATE TABLE IF NOT EXISTS public.wallet_transactions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  wallet_id UUID NOT NULL REFERENCES public.wallets(id),
  type TEXT NOT NULL CHECK (type IN ('CREDIT', 'DEBIT')),
  amount INTEGER NOT NULL CHECK (amount > 0),
  reason TEXT NOT NULL CHECK (reason IN ('REFUND', 'PURCHASE', 'ADMIN_CREDIT', 'ADMIN_DEBIT')),
  reference_order_id TEXT,
  description TEXT,
  balance_after INTEGER NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 3. Add cancellation + wallet columns to orders
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS cancelled_at TIMESTAMPTZ;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS cancellation_reason TEXT;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS refund_amount INTEGER;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS payment_method TEXT DEFAULT 'RAZORPAY';

-- 4. Index for fast wallet lookups
CREATE INDEX IF NOT EXISTS idx_wallets_user_email ON public.wallets(user_email);
CREATE INDEX IF NOT EXISTS idx_wallet_txn_wallet_id ON public.wallet_transactions(wallet_id);
CREATE INDEX IF NOT EXISTS idx_wallet_txn_reference ON public.wallet_transactions(reference_order_id);

-- 5. RLS for wallets (service role bypasses, but good practice)
ALTER TABLE public.wallets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wallet_transactions ENABLE ROW LEVEL SECURITY;

-- Allow service role full access (backend uses service role key)
-- Frontend never directly queries these tables
