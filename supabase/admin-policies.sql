-- Admin RLS policies for McBlox
-- Run this AFTER schema.sql
-- Replace the UUIDs below with your actual admin user IDs from Supabase Auth

-- Admin can read ALL games (any status)
CREATE POLICY "Admins can read all games"
  ON games FOR SELECT
  USING (
    auth.uid() IN (
      -- Add your admin user UUIDs here:
      -- '00000000-0000-0000-0000-000000000000'::uuid
      auth.uid() -- Temporary: allows any signed-in user to read all games
    )
  );

-- Admin can update ANY game (approve/reject)
CREATE POLICY "Admins can update all games"
  ON games FOR UPDATE
  USING (
    auth.uid() IN (
      -- Add your admin user UUIDs here:
      -- '00000000-0000-0000-0000-000000000000'::uuid
      auth.uid() -- Temporary: allows any signed-in user to update any game
    )
  );

-- NOTE: The temporary policies above let any signed-in user act as admin.
-- Once you have your admin account UUIDs, replace with explicit IDs like:
--
-- CREATE POLICY "Admins can read all games"
--   ON games FOR SELECT
--   USING (
--     auth.uid() = 'your-admin-uuid-here'::uuid
--     OR status = 'approved'
--     OR auth.uid() = creator_id
--   );
