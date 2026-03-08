-- ============================================================
-- ALIGN APP — Supabase Schema
-- Run this entire file in Supabase SQL Editor (one shot)
-- ============================================================

-- ---- Profiles (extends auth.users) ----
CREATE TABLE IF NOT EXISTS profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  username TEXT UNIQUE NOT NULL,
  display_name TEXT,
  avatar_color TEXT DEFAULT '#6c5ce7',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ---- Tasks ----
CREATE TABLE IF NOT EXISTS tasks (
  id BIGINT PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  text TEXT NOT NULL,
  category TEXT DEFAULT 'Personal',
  priority TEXT DEFAULT 'None',
  completed BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ
);

-- ---- Daily Stats ----
CREATE TABLE IF NOT EXISTS daily_stats (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  completions INT DEFAULT 0,
  flow_seconds INT DEFAULT 0,
  UNIQUE(user_id, date)
);

-- ---- Friendships ----
CREATE TABLE IF NOT EXISTS friendships (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  requester_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  addressee_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'pending', -- 'pending' | 'accepted' | 'declined'
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(requester_id, addressee_id)
);

-- ============================================================
-- Row Level Security
-- ============================================================

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE daily_stats ENABLE ROW LEVEL SECURITY;
ALTER TABLE friendships ENABLE ROW LEVEL SECURITY;

-- Profiles
DROP POLICY IF EXISTS "Own profile" ON profiles;
CREATE POLICY "Own profile" ON profiles FOR ALL USING (auth.uid() = id);

DROP POLICY IF EXISTS "Friends can view profiles" ON profiles;
CREATE POLICY "Friends can view profiles" ON profiles FOR SELECT
  USING (
    id = auth.uid() OR
    id IN (
      SELECT CASE WHEN requester_id = auth.uid() THEN addressee_id ELSE requester_id END
      FROM friendships
      WHERE (requester_id = auth.uid() OR addressee_id = auth.uid()) AND status = 'accepted'
    )
  );

-- Allow searching by username (needed for friend search — returns minimal info)
DROP POLICY IF EXISTS "Public username search" ON profiles;
CREATE POLICY "Public username search" ON profiles FOR SELECT
  USING (true); -- username + avatar_color are non-sensitive; RLS on tasks protects actual data

-- Tasks
DROP POLICY IF EXISTS "Own tasks" ON tasks;
CREATE POLICY "Own tasks" ON tasks FOR ALL USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Friends view tasks" ON tasks;
CREATE POLICY "Friends view tasks" ON tasks FOR SELECT
  USING (
    user_id = auth.uid() OR
    user_id IN (
      SELECT CASE WHEN requester_id = auth.uid() THEN addressee_id ELSE requester_id END
      FROM friendships
      WHERE (requester_id = auth.uid() OR addressee_id = auth.uid()) AND status = 'accepted'
    )
  );

-- Daily Stats
DROP POLICY IF EXISTS "Own stats" ON daily_stats;
CREATE POLICY "Own stats" ON daily_stats FOR ALL USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Friends view stats" ON daily_stats;
CREATE POLICY "Friends view stats" ON daily_stats FOR SELECT
  USING (
    user_id = auth.uid() OR
    user_id IN (
      SELECT CASE WHEN requester_id = auth.uid() THEN addressee_id ELSE requester_id END
      FROM friendships
      WHERE (requester_id = auth.uid() OR addressee_id = auth.uid()) AND status = 'accepted'
    )
  );

-- Friendships
DROP POLICY IF EXISTS "Manage friendships" ON friendships;
CREATE POLICY "Manage friendships" ON friendships FOR ALL
  USING (auth.uid() = requester_id OR auth.uid() = addressee_id);

-- ============================================================
-- Realtime (enable for friendships to show live badge updates)
-- ============================================================
ALTER PUBLICATION supabase_realtime ADD TABLE friendships;
