-- Migration: 003_create_payment_transactions_table
-- Description: Creates payment_transactions table for idempotent payment processing
-- Requirements: 9.1, 9.2, 9.3, 9.5, 9.9 - Payment idempotency and single source of truth
-- Task: 2. Implement payment flow validation and idempotency

-- ========================================
-- PAYMENT TRANSACTIONS TABLE
-- ========================================
-- Purpose: Store all payment attempts with idempotency guarantees
-- Idempotency Key: razorpay_payment_id (unique constraint prevents duplicates)

CREATE TABLE IF NOT EXISTS payment_transactions (
  -- Primary key: Auto-incrementing ID
  id SERIAL PRIMARY KEY,
  
  -- Idempotency key: Razorpay payment ID (UNIQUE constraint)
  razorpay_payment_id TEXT UNIQUE NOT NULL,
  
  -- Razorpay order ID (from create-order API)
  razorpay_order_id TEXT NOT NULL,
  
  -- Razorpay signature (for webhook verification)
  razorpay_signature TEXT,
  
  -- Payment amount in paise (100 paise = 1 rupee)
  amount INTEGER NOT NULL,
  
  -- Currency code (INR, USD, etc.)
  currency TEXT NOT NULL DEFAULT 'INR',
  
  -- Payment status: initiated, processing, success, failed, abandoned
  status TEXT NOT NULL DEFAULT 'initiated',
  
  -- User email (foreign key to users table)
  user_email TEXT REFERENCES users(email) ON DELETE SET NULL,
  
  -- Order ID (foreign key to orders table, set after order creation)
  order_id TEXT,
  
  -- Webhook received flag
  webhook_received BOOLEAN DEFAULT false,
  
  -- Webhook received timestamp
  webhook_timestamp TIMESTAMPTZ,
  
  -- Signature verification status
  signature_verified BOOLEAN DEFAULT false,
  
  -- Error reason (if payment failed)
  error_reason TEXT,
  
  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  
  -- Constraints
  CONSTRAINT valid_status CHECK (status IN ('initiated', 'processing', 'success', 'failed', 'abandoned')),
  CONSTRAINT valid_currency CHECK (currency IN ('INR', 'USD', 'EUR', 'GBP')),
  CONSTRAINT positive_amount CHECK (amount > 0)
);

-- ========================================
-- INDEXES
-- ========================================

-- Index on razorpay_payment_id for fast idempotency checks
CREATE INDEX IF NOT EXISTS idx_payment_transactions_razorpay_payment_id 
  ON payment_transactions(razorpay_payment_id);

-- Index on razorpay_order_id for order lookups
CREATE INDEX IF NOT EXISTS idx_payment_transactions_razorpay_order_id 
  ON payment_transactions(razorpay_order_id);

-- Index on user_email for user payment history
CREATE INDEX IF NOT EXISTS idx_payment_transactions_user_email 
  ON payment_transactions(user_email);

-- Index on status for filtering by payment status
CREATE INDEX IF NOT EXISTS idx_payment_transactions_status 
  ON payment_transactions(status);

-- Index on created_at for time-based queries
CREATE INDEX IF NOT EXISTS idx_payment_transactions_created_at 
  ON payment_transactions(created_at DESC);

-- ========================================
-- TRIGGERS
-- ========================================

-- Trigger to automatically update updated_at on row changes
DROP TRIGGER IF EXISTS trigger_payment_transactions_updated_at ON payment_transactions;
CREATE TRIGGER trigger_payment_transactions_updated_at
  BEFORE UPDATE ON payment_transactions
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- ========================================
-- ROW LEVEL SECURITY (RLS)
-- ========================================

-- Enable RLS for Supabase best practices
ALTER TABLE payment_transactions ENABLE ROW LEVEL SECURITY;

-- Policy: Service role has full access (backend operations)
CREATE POLICY "Service role has full access" ON payment_transactions
  FOR ALL
  USING (true)
  WITH CHECK (true);

-- Policy: Users can view their own payment transactions
CREATE POLICY "Users can view own payments" ON payment_transactions
  FOR SELECT
  USING (auth.jwt() ->> 'email' = user_email);

-- ========================================
-- COMMENTS
-- ========================================

COMMENT ON TABLE payment_transactions IS 'Stores all payment transactions with idempotency guarantees using razorpay_payment_id as unique key';
COMMENT ON COLUMN payment_transactions.razorpay_payment_id IS 'Idempotency key - prevents duplicate payment processing';
COMMENT ON COLUMN payment_transactions.signature_verified IS 'True if Razorpay webhook signature was verified successfully';
COMMENT ON COLUMN payment_transactions.webhook_received IS 'True if webhook was received from Razorpay';
