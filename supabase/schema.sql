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
