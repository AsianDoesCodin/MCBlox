export interface Game {
  id: string;
  title: string;
  description: string;
  tags: string[];
  thumbnail_url: string | null;
  modpack_url: string;
  mc_version: string;
  mod_loader: string;
  loader_version: string | null;
  game_type: 'server' | 'world';
  server_address: string | null;
  world_name: string | null;
  thumbs_up: number;
  thumbs_down: number;
  total_plays: number;
  player_count?: number;
  is_promoted: boolean;
  auto_join: boolean;
  status: string;
  created_at: string;
  author?: string;
}
