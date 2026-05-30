-- ============================================================
-- RankMaster Pro — Admin flag for platform settings gating
-- Migration: 017_admin_flag.sql
--
-- The `settings` table is a single global config store (shared AI/SERP
-- API keys funded by the platform operator). Writes must be restricted
-- to admins so a regular signed-up user cannot overwrite platform keys.
-- ============================================================

-- 1. Add is_admin to profiles (default false)
ALTER TABLE profiles
    ADD COLUMN IF NOT EXISTS is_admin BOOLEAN NOT NULL DEFAULT false;

-- 2. Bootstrap: the earliest-created user (the operator who set the app up)
--    becomes admin so nobody is locked out of Settings.
DO $$
DECLARE
    first_user UUID;
BEGIN
    SELECT id INTO first_user FROM auth.users ORDER BY created_at ASC LIMIT 1;
    IF first_user IS NOT NULL THEN
        UPDATE profiles SET is_admin = true WHERE id = first_user;
    END IF;
END $$;

-- 3. Optional: promote specific emails to admin (edit as needed).
-- UPDATE profiles SET is_admin = true WHERE email IN ('you@example.com');
