-- ============================================================
-- RankMaster Pro — User Profiles & Account Management
-- Migration: 014_user_profiles.sql
-- ============================================================

-- 1. Create profiles table (1:1 with auth.users)
CREATE TABLE IF NOT EXISTS profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    email TEXT NOT NULL,
    display_name TEXT,
    avatar_url TEXT,
    bio TEXT,
    timezone TEXT DEFAULT 'UTC',
    date_format TEXT DEFAULT 'MMM dd, yyyy',
    theme TEXT DEFAULT 'dark' CHECK (theme IN ('dark', 'light', 'system')),
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- 2. Enable Row Level Security
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

-- Users can read their own profile
CREATE POLICY "Users can read own profile"
    ON profiles FOR SELECT
    USING (auth.uid() = id);

-- Users can update their own profile
CREATE POLICY "Users can update own profile"
    ON profiles FOR UPDATE
    USING (auth.uid() = id)
    WITH CHECK (auth.uid() = id);

-- Users can insert their own profile (for trigger/initial creation)
CREATE POLICY "Users can insert own profile"
    ON profiles FOR INSERT
    WITH CHECK (auth.uid() = id);

-- Authenticated users can read basic profile info of others (for team display)
CREATE POLICY "Authenticated users can read all profiles"
    ON profiles FOR SELECT
    USING (auth.role() = 'authenticated');

-- 3. Auto-update updated_at timestamp
CREATE OR REPLACE FUNCTION update_profiles_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER profiles_updated_at
    BEFORE UPDATE ON profiles
    FOR EACH ROW
    EXECUTE FUNCTION update_profiles_updated_at();

-- 4. Auto-create profile on new user signup
CREATE OR REPLACE FUNCTION create_profile_for_new_user()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO public.profiles (id, email, display_name)
    VALUES (
        NEW.id,
        NEW.email,
        COALESCE(NEW.raw_user_meta_data->>'display_name', NULL)
    );
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW
    EXECUTE FUNCTION create_profile_for_new_user();

-- 5. Create profiles for any existing users who don't have one yet
INSERT INTO profiles (id, email)
SELECT id, email FROM auth.users
WHERE id NOT IN (SELECT id FROM profiles)
ON CONFLICT (id) DO NOTHING;

-- 6. Fix team_members role constraint to include 'writer'
-- Drop existing constraint and recreate with 'writer' included
DO $$
BEGIN
    -- Check if the constraint exists before trying to drop it
    IF EXISTS (
        SELECT 1 FROM information_schema.table_constraints
        WHERE table_name = 'team_members' AND constraint_type = 'CHECK'
        AND constraint_name LIKE '%role%'
    ) THEN
        ALTER TABLE team_members DROP CONSTRAINT IF EXISTS team_members_role_check;
    END IF;

    -- Add the updated constraint with 'writer' included
    ALTER TABLE team_members
        ADD CONSTRAINT team_members_role_check
        CHECK (role IN ('admin', 'editor', 'writer', 'viewer'));
EXCEPTION
    WHEN undefined_table THEN
        -- team_members table doesn't exist yet, skip
        NULL;
END $$;

-- 7. Create storage bucket for avatars (run manually in Supabase dashboard if needed)
-- INSERT INTO storage.buckets (id, name, public)
-- VALUES ('avatars', 'avatars', true)
-- ON CONFLICT (id) DO NOTHING;
