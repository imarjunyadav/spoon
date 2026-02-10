-- ========================================
-- CRITICAL: Enable Realtime for users table
-- ========================================

-- 1. Add 'users' table to the Supabase Realtime publication
-- Without this, NO postgres_changes events are emitted for the users table.
ALTER PUBLICATION supabase_realtime ADD TABLE public.users;

-- 2. Set REPLICA IDENTITY to FULL
-- Required for filtered Realtime subscriptions (e.g., filter by email).
-- Without this, UPDATE events only include the primary key in the old record,
-- and Supabase cannot determine which subscriber should receive the event.
ALTER TABLE public.users REPLICA IDENTITY FULL;
