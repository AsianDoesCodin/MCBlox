import { useState, useEffect } from "react";
import GameCard from "../components/GameCard";
import GameDetail from "../components/GameDetail";
import { SkeletonGrid } from "../components/Skeleton";
import type { Game } from "../types";
import { supabase } from "../lib/supabase";
import type { GameSession } from "../App";

interface Props {
  session: GameSession;
  onPlay: (game: Game) => Promise<any>;
  onStop: () => Promise<void>;
}

const TAGS = [
  'Adventure', 'RPG', 'PvP', 'Creative', 'Survival',
  'Skyblock', 'Horror', 'Puzzle', 'Minigame', 'Parkour',
  'Tech', 'Magic', 'Quests', 'Building', 'Exploration',
  'Competitive', 'Coop', 'Story', 'Open World', 'Hardcore'
];

export default function Home({ session, onPlay, onStop }: Props) {
  const [games, setGames] = useState<Game[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<"popular" | "newest" | "top-rated" | "players" | "featured">("popular");
  const [selected, setSelected] = useState<Game | null>(null);
  const [activeTags, setActiveTags] = useState<Set<string>>(new Set());
  const [showTags, setShowTags] = useState(false);
  const [typeFilter, setTypeFilter] = useState<"all" | "server" | "world">("all");

  useEffect(() => {
    loadGames();
  }, []);

  async function loadGames() {
    setLoading(true);
    try {
      if (supabase) {
        const { data } = await supabase
          .from("games")
          .select("*, profiles:creator_id(username)")
          .eq("status", "approved");
        if (data) {
          const twoMinAgo = new Date(Date.now() - 120000).toISOString();
          const { data: activity } = await supabase
            .from("player_activity")
            .select("game_id")
            .gte("last_heartbeat", twoMinAgo);

          const counts: Record<string, number> = {};
          if (activity) {
            for (const row of activity) {
              counts[row.game_id] = (counts[row.game_id] || 0) + 1;
            }
          }

          setGames(data.map((g: any) => ({
            ...g,
            player_count: counts[g.id] || 0,
            author: g.profiles?.username || 'Unknown',
          })));
        }
      }
    } finally {
      setLoading(false);
    }
  }

  function toggleTag(tag: string) {
    const key = tag.toLowerCase();
    setActiveTags(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  const query = search.toLowerCase().trim();
  let filtered = games.filter((g) => {
    if (query && !g.title.toLowerCase().includes(query)) return false;
    if (typeFilter !== "all" && g.game_type !== typeFilter) return false;
    if (activeTags.size > 0) {
      const gameTags = (g.tags || []).map(t => t.toLowerCase());
      if (![...activeTags].every(t => gameTags.includes(t))) return false;
    }
    return true;
  });

  if (sort === "popular") filtered.sort((a, b) => (b.total_plays || 0) - (a.total_plays || 0));
  else if (sort === "newest") filtered.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  else if (sort === "top-rated") filtered.sort((a, b) => (b.thumbs_up || 0) - (a.thumbs_up || 0));
  else if (sort === "players") filtered.sort((a, b) => (b.player_count || 0) - (a.player_count || 0));
  else if (sort === "featured") filtered.sort((a, b) => (b.is_promoted ? 1 : 0) - (a.is_promoted ? 1 : 0));

  const featured = filtered.filter((g) => g.is_promoted);
  const nonFeatured = filtered.filter((g) => !g.is_promoted);
  const popular = [...nonFeatured].sort((a, b) => (b.player_count || 0) + (b.total_plays || 0) - (a.player_count || 0) - (a.total_plays || 0)).slice(0, 8);
  const popularIds = new Set(popular.map(g => g.id));
  const discover = nonFeatured.filter(g => !popularIds.has(g.id));

  if (selected) {
    return (
      <GameDetail
        game={selected}
        onBack={() => setSelected(null)}
        onPlay={onPlay}
        onStop={onStop}
        session={session}
      />
    );
  }

  return (
    <div className="h-full flex flex-col">
      {/* Top bar */}
      <div className="flex items-center gap-3 px-6 py-3 bg-[#150e28] border-b-2 border-[rgba(184,169,232,0.10)] shrink-0 flex-nowrap">
        <div className="relative max-w-[400px] flex-1 min-w-[180px] flex">
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search games..."
            className="w-full pl-4 pr-10 py-2 bg-[#1a1232] border-2 border-[rgba(184,169,232,0.10)] rounded-l text-sm text-white outline-none focus:border-[#e8956a] placeholder:text-[#5c5478]"
          />
          <button
            className="px-3 bg-[#e8956a] hover:bg-[#f0a87e] border-2 border-[#e8956a] rounded-r flex items-center justify-center cursor-pointer transition-colors"
            onClick={() => {/* search is live, button is visual */}}
            tabIndex={-1}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="11" cy="11" r="8"/>
              <path d="m21 21-4.35-4.35"/>
            </svg>
          </button>
        </div>
        <div className="flex-1" />
        <select
          value={sort}
          onChange={(e) => setSort(e.target.value as typeof sort)}
          className="px-4 py-2 bg-[#1a1232] border-2 border-[rgba(184,169,232,0.10)] rounded text-xs text-[#c4bdd6] outline-none cursor-pointer hover:border-[#e8956a] shrink-0"
        >
          <option value="popular">Most Popular</option>
          <option value="players">Current Players</option>
          <option value="top-rated">Top Rated</option>
          <option value="newest">Newest</option>
          <option value="featured">Featured</option>
        </select>

        <div className="relative shrink-0">
          <button
            onClick={() => setShowTags(!showTags)}
            className={`px-4 py-2 rounded text-xs font-semibold cursor-pointer transition-all border-2 ${
              activeTags.size > 0 || typeFilter !== "all"
                ? 'bg-[#e8956a] border-[#e8956a] text-white'
                : 'bg-[#1a1232] border-[rgba(184,169,232,0.10)] text-[#8b82a8] hover:border-[#e8956a]'
            }`}
          >
            Tags {(activeTags.size > 0 || typeFilter !== "all") ? `(${activeTags.size + (typeFilter !== "all" ? 1 : 0)})` : ''}
          </button>
          {showTags && (
            <>
              <div className="fixed inset-0 z-40" onClick={() => setShowTags(false)} />
              <div className="absolute right-0 top-full mt-2 z-50 w-[320px] p-3 bg-[#231a42] border-2 border-[#e8956a] rounded shadow-xl" style={{boxShadow: '0 8px 32px rgba(0,0,0,0.5), 0 0 15px rgba(232,149,106,0.15)'}}>
                {/* Game type filter */}
                <div className="flex gap-1.5 mb-2 pb-2 border-b border-[rgba(184,169,232,0.10)]">
                  {([["all", "All"], ["server", "Multiplayer"], ["world", "Singleplayer"]] as const).map(([val, label]) => (
                    <button
                      key={val}
                      onClick={() => setTypeFilter(val)}
                      className={`px-2.5 py-1 rounded text-[11px] cursor-pointer transition-all border-2 ${
                        typeFilter === val
                          ? 'bg-[#e8956a] border-[#e8956a] text-white font-bold'
                          : 'bg-[#2d2250] border-[rgba(184,169,232,0.10)] text-[#8b82a8] hover:border-[#e8956a] hover:text-white'
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {TAGS.map(tag => (
                    <button
                      key={tag}
                      onClick={() => toggleTag(tag)}
                      className={`px-2.5 py-1 rounded text-[11px] cursor-pointer transition-all border-2 ${
                        activeTags.has(tag.toLowerCase())
                          ? 'bg-[#e8956a] border-[#e8956a] text-white font-bold'
                          : 'bg-[#2d2250] border-[rgba(184,169,232,0.10)] text-[#8b82a8] hover:border-[#e8956a] hover:text-white'
                      }`}
                    >
                      {tag}
                    </button>
                  ))}
                </div>
                {(activeTags.size > 0 || typeFilter !== "all") && (
                  <button
                    onClick={() => { setActiveTags(new Set()); setTypeFilter("all"); }}
                    className="mt-2 text-[11px] text-[#808080] hover:text-white cursor-pointer"
                  >
                    Clear all
                  </button>
                )}
              </div>
            </>
          )}
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <div className="px-6 pt-5 pb-8">
            <SkeletonGrid count={6} />
          </div>
        ) : search ? (
          /* Search results — flat list */
          <div className="px-6 pt-5 pb-8">
            <h2 className="text-base font-bold mb-3" style={{color: '#f0c35e'}}>
              Results for "{search}"
            </h2>
            {filtered.length > 0 ? (
              <div className="grid grid-cols-[repeat(auto-fill,minmax(180px,1fr))] gap-4">
                {filtered.map((g) => (
                  <GameCard key={g.id} game={g} onClick={setSelected} session={session} onPlay={onPlay} onStop={onStop} />
                ))}
              </div>
            ) : (
              <div className="text-center py-16">
                <span className="text-4xl mb-3 block">⛏</span>
                <p className="text-[#8b82a8]">No games found</p>
              </div>
            )}
          </div>
        ) : sort !== 'popular' ? (
          /* Non-default sort — flat sorted list */
          <div className="px-6 pt-5 pb-8">
            {filtered.length > 0 ? (
              <div className="grid grid-cols-[repeat(auto-fill,minmax(180px,1fr))] gap-4">
                {filtered.map((g) => (
                  <GameCard key={g.id} game={g} onClick={setSelected} session={session} onPlay={onPlay} onStop={onStop} />
                ))}
              </div>
            ) : (
              <div className="text-center py-16">
                <span className="text-4xl mb-3 block">⛏</span>
                <p className="text-[#8b82a8]">No games yet</p>
              </div>
            )}
          </div>
        ) : (
          <>
            {/* Featured section */}
            {featured.length > 0 && (
              <div className="px-6 pt-5 pb-2">
                <h2 className="text-base font-bold mb-3 flex items-center gap-2" style={{color: '#f0c35e'}}>
                  ⭐ Featured
                </h2>
                <div className="grid grid-cols-[repeat(auto-fill,minmax(180px,1fr))] gap-4">
                  {featured.map((g) => (
                    <GameCard key={g.id} game={g} onClick={setSelected} session={session} onPlay={onPlay} onStop={onStop} />
                  ))}
                </div>
              </div>
            )}

            {/* Popular section */}
            {popular.length > 0 && (
              <div className="px-6 pt-5 pb-2">
                <h2 className="text-base font-bold mb-3 flex items-center gap-2" style={{color: '#e8956a'}}>
                  🔥 Popular
                </h2>
                <div className="grid grid-cols-[repeat(auto-fill,minmax(180px,1fr))] gap-4">
                  {popular.map((g) => (
                    <GameCard key={g.id} game={g} onClick={setSelected} session={session} onPlay={onPlay} onStop={onStop} />
                  ))}
                </div>
              </div>
            )}

            {/* Discover section */}
            {discover.length > 0 && (
              <div className="px-6 pt-5 pb-8">
                <h2 className="text-base font-bold mb-3 flex items-center gap-2" style={{color: '#c4bdd6'}}>
                  🎮 Discover
                </h2>
                <div className="grid grid-cols-[repeat(auto-fill,minmax(180px,1fr))] gap-4">
                  {discover.map((g) => (
                    <GameCard key={g.id} game={g} onClick={setSelected} session={session} onPlay={onPlay} onStop={onStop} />
                  ))}
                </div>
              </div>
            )}

            {filtered.length === 0 && (
              <div className="text-center py-16">
                <span className="text-4xl mb-3 block">⛏</span>
                <p className="text-[#8b82a8]">No games found</p>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
