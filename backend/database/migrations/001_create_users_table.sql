-- Migration: 001_create_users_table
-- Description: Creates the users table for storing verified user accounts
-- Requirements: 3.5 - THE Supabase_Users_Table SHALL store: email (primary key), name, created_at, updated_at

CREATE TABLE IF NOT EXISTS users (
  email TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for faster email lookups (though email is PK, explicit index for clarity)
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);

-- Trigger function to automatically update updated_at on row changes
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to call the function before any UPDATE
DROP TRIGGER IF EXISTS trigger_users_updated_at ON users;
CREATE TRIGGER trigger_users_updated_at
  BEFORE UPDATE ON users
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Enable Row Level Security (RLS) for Supabase best practices
ALTER TABLE users ENABLE ROW LEVEL SECURITY;

-- Policy: Allow service role full access (backend operations)
CREATE POLICY "Service role has full access" ON users
  FOR ALL
  USING (true)
  WITH CHECK (true);
