-- Enable RLS on users table if not already enabled
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;

-- Policy: Users can read their own data via EMAIL
-- Drop existing policies to be safe
DROP POLICY IF EXISTS "Users can read own record" ON public.users;
DROP POLICY IF EXISTS "Users can update own record" ON public.users;

-- RLS Policy based on EMAIL (since 'id' column might be named differently or not linked to auth.uid() 1:1 in this specific schema setup)
-- Supabase auth.email() returns the email of the currently logged in user.
CREATE POLICY "Users can read own record" 
ON public.users 
FOR SELECT 
USING (email = auth.email());

-- Policy: Users can update their own data via EMAIL
CREATE POLICY "Users can update own record" 
ON public.users 
FOR UPDATE 
USING (email = auth.email());
