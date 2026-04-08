-- McBlox Supabase Schema
-- Run this in the Supabase SQL Editor to set up the database

-- Games table
CREATE TABLE IF NOT EXISTS games (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  creator_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  tags TEXT[] DEFAULT '{}',
  thumbnail_url TEXT,
  screenshots TEXT[] DEFAULT '{}',
  modpack_url TEXT NOT NULL,
  mc_version TEXT NOT NULL,
  mod_loader TEXT NOT NULL CHECK (mod_loader IN ('fabric', 'forge', 'neoforge', 'quilt')),
  game_type TEXT NOT NULL CHECK (game_type IN ('server', 'world')),
  server_address TEXT,
  world_name TEXT,
  status TEXT NOT NULL DEFAULT 'pending_review' CHECK (status IN ('pending_review', 'approved', 'rejected', 'unlisted')),
  thumbs_up INT DEFAULT 0,
  thumbs_down INT DEFAULT 0,
  total_plays INT DEFAULT 0,
  player_count INT DEFAULT 0,
  is_promoted BOOLEAN DEFAULT FALSE,
  auto_join BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable Row Level Security
ALTER TABLE games ENABLE ROW LEVEL SECURITY;

-- Anyone can read approved games
CREATE POLICY "Public can read approved games"
  ON games FOR SELECT
  USING (status = 'approved');

-- Creators can read their own games (any status)
CREATE POLICY "Creators can read own games"
  ON games FOR SELECT
  USING (auth.uid() = creator_id);

-- Creators can insert their own games
CREATE POLICY "Creators can insert own games"
  ON games FOR INSERT
  WITH CHECK (auth.uid() = creator_id);

-- Creators can update their own games
CREATE POLICY "Creators can update own games"
  ON games FOR UPDATE
  USING (auth.uid() = creator_id);

-- Ratings table
CREATE TABLE IF NOT EXISTS ratings (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  game_id UUID NOT NULL REFERENCES games(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  vote TEXT NOT NULL CHECK (vote IN ('up', 'down')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (game_id, user_id)
);

ALTER TABLE ratings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read ratings"
  ON ratings FOR SELECT
  USING (true);

CREATE POLICY "Users can insert own ratings"
  ON ratings FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own ratings"
  ON ratings FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own ratings"
  ON ratings FOR DELETE
  USING (auth.uid() = user_id);

-- Function to update thumbs_up/thumbs_down counts on games
CREATE OR REPLACE FUNCTION update_game_rating_counts()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE games SET
    thumbs_up = (SELECT COUNT(*) FROM ratings WHERE game_id = COALESCE(NEW.game_id, OLD.game_id) AND vote = 'up'),
    thumbs_down = (SELECT COUNT(*) FROM ratings WHERE game_id = COALESCE(NEW.game_id, OLD.game_id) AND vote = 'down')
  WHERE id = COALESCE(NEW.game_id, OLD.game_id);
  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_rating_change
  AFTER INSERT OR UPDATE OR DELETE ON ratings
  FOR EACH ROW EXECUTE FUNCTION update_game_rating_counts();

-- Updated at trigger
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER games_updated_at
  BEFORE UPDATE ON games
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Storage bucket for game thumbnails and screenshots
-- Run this separately or in Supabase dashboard:
-- INSERT INTO storage.buckets (id, name, public) VALUES ('game-assets', 'game-assets', true);

-- Index for faster queries
CREATE INDEX IF NOT EXISTS idx_games_status ON games(status);
CREATE INDEX IF NOT EXISTS idx_games_creator ON games(creator_id);
CREATE INDEX IF NOT EXISTS idx_games_promoted ON games(is_promoted) WHERE is_promoted = true;
CREATE INDEX IF NOT EXISTS idx_ratings_game ON ratings(game_id);

-- Increment play count RPC
CREATE OR REPLACE FUNCTION increment_plays(game_id UUID)
RETURNS VOID AS $$
BEGIN
  UPDATE games SET total_plays = total_plays + 1 WHERE id = game_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Profiles table (for username, avatar, etc.)
CREATE TABLE IF NOT EXISTS profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  username TEXT,
  avatar_url TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read profiles"
  ON profiles FOR SELECT
  USING (true);

CREATE POLICY "Users can update own profile"
  ON profiles FOR UPDATE
  USING (auth.uid() = id);

CREATE POLICY "Users can insert own profile"
  ON profiles FOR INSERT
  WITH CHECK (auth.uid() = id);

-- Add avatar_url column if profiles table already exists
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS avatar_url TEXT;

-- Player activity table (heartbeat-based active player tracking)
CREATE TABLE IF NOT EXISTS player_activity (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  game_id UUID NOT NULL REFERENCES games(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  mc_username TEXT NOT NULL,
  last_heartbeat TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (game_id, mc_username)
);

ALTER TABLE player_activity ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read player activity"
  ON player_activity FOR SELECT
  USING (true);

-- RPC for heartbeat (works without auth, keyed by mc_username)
CREATE OR REPLACE FUNCTION heartbeat(p_game_id UUID, p_mc_username TEXT)
RETURNS VOID AS $$
BEGIN
  INSERT INTO player_activity (game_id, mc_username, last_heartbeat)
  VALUES (p_game_id, p_mc_username, NOW())
  ON CONFLICT (game_id, mc_username) DO UPDATE SET last_heartbeat = NOW();
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE INDEX IF NOT EXISTS idx_player_activity_game ON player_activity(game_id);
CREATE INDEX IF NOT EXISTS idx_player_activity_heartbeat ON player_activity(last_heartbeat);
