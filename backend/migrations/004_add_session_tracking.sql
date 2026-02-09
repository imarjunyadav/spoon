-- Migration: Add session tracking columns to users table
ALTER TABLE public.users
ADD COLUMN IF NOT EXISTS active_session_token UUID DEFAULT NULL,
ADD COLUMN IF NOT EXISTS session_created_at TIMESTAMPTZ DEFAULT NULL;

-- Index for fast lookup
CREATE INDEX IF NOT EXISTS idx_users_active_session ON public.users(email, active_session_token);
