-- Run this in Supabase SQL Editor so facility staff can load their dashboard.
-- The facility page (1) reads users by auth_id, (2) reads user_access by user_id.
-- If RLS blocks either, you get "No facility access found" even though login works.

-- 1) Let each user read their own row in users (so we can get users.id from auth_id)
DROP POLICY IF EXISTS "Users can read own user row" ON users;
CREATE POLICY "Users can read own user row"
ON users FOR SELECT
USING (auth_id = auth.uid());

-- 2) Let each user read their own rows in user_access (so facility page can get resource_id)
DROP POLICY IF EXISTS "Users can read own user_access" ON user_access;
CREATE POLICY "Users can read own user_access"
ON user_access FOR SELECT
USING (
  user_id = auth.uid()
  OR user_id IN (SELECT id FROM public.users WHERE auth_id = auth.uid())
);
