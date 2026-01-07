-- Migration: 002_add_admin_column
-- Description: Adds is_admin column to users table for admin role verification
-- Requirements: 1.1, 1.2, 8.1, 8.2 - Admin status stored in database with default false

-- Add is_admin column with default value of false
ALTER TABLE users ADD COLUMN IF NOT EXISTS is_admin BOOLEAN DEFAULT false;

-- Partial index for efficient admin lookups (only indexes rows where is_admin = true)
CREATE INDEX IF NOT EXISTS idx_users_is_admin ON users(is_admin) WHERE is_admin = true;

-- Example: Grant admin privileges to a user
-- UPDATE users SET is_admin = true WHERE email = 'admin@example.com';
