import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import GameCard from "../components/GameCard";
import GameDetail from "../components/GameDetail";
import { SkeletonGrid } from "../components/Skeleton";
import type { Game } from "../types";
import { supabase } from "../lib/supabase";

const TAGS = [
  'Adventure', 'RPG', 'PvP', 'Creative', 'Survival',
  'Skyblock', 'Horror', 'Puzzle', 'Minigame', 'Parkour',
  'Tech', 'Magic', 'Quests', 'Building', 'Exploration',
  'Competitive', 'Coop', 'Story', 'Open World', 'Hardcore'
];

export default function Home() {
  const [games, setGames] = useState<Game[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<"popular" | "newest" | "top-rated">("popular");
  const [selected, setSelected] = useState<Game | null>(null);
  const [activeTags, setActiveTags] = useState<Set<string>>(new Set());
  const [showTags, setShowTags] = useState(false);

  useEffect(() => {
    loadGames();
    return () => stopHeartbeat();
  }, []);

  async function loadGames() {
    setLoading(true);
    try {
      if (supabase) {
        const { data } = await supabase
          .from("games")
          .select("*")
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

          setGames(data.map(g => ({ ...g, player_count: counts[g.id] || 0 })));
        }
      }
    } finally {
      setLoading(false);
    }
  }

  // Heartbeat ref to track playing state
  const heartbeatRef = { current: null as ReturnType<typeof setInterval> | null };

  async function startHeartbeat(gameId: string) {
    if (!supabase) return;
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return;

    // Insert initial activity
    await supabase.from("player_activity").upsert({
      game_id: gameId,
      user_id: session.user.id,
      last_heartbeat: new Date().toISOString(),
    }, { onConflict: "game_id,user_id" });

    // Heartbeat every 60 seconds
    const sb = supabase;
    heartbeatRef.current = setInterval(async () => {
      await sb.from("player_activity").upsert({
        game_id: gameId,
        user_id: session.user.id,
        last_heartbeat: new Date().toISOString(),
      }, { onConflict: "game_id,user_id" });
    }, 60000);
  }

  function stopHeartbeat() {
    if (heartbeatRef.current) {
      clearInterval(heartbeatRef.current);
      heartbeatRef.current = null;
    }
  }

  async function handlePlay(game: Game) {
    const result = await invoke("launch_game", {
      request: {
        game_id: game.id,
        title: game.title,
        modpack_url: game.modpack_url || "",
        mc_version: game.mc_version || "1.21.1",
        mod_loader: game.mod_loader || "fabric",
        loader_version: game.loader_version || null,
        game_type: game.game_type || "server",
        server_address: game.server_address || null,
      }
    });
    startHeartbeat(game.id);
    return result;
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
    if (activeTags.size > 0) {
      const gameTags = (g.tags || []).map(t => t.toLowerCase());
      if (![...activeTags].every(t => gameTags.includes(t))) return false;
    }
    return true;
  });

  if (sort === "popular") filtered.sort((a, b) => (b.total_plays || 0) - (a.total_plays || 0));
  else if (sort === "newest") filtered.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  else if (sort === "top-rated") filtered.sort((a, b) => (b.thumbs_up || 0) - (a.thumbs_up || 0));

  const featured = filtered.filter((g) => g.is_promoted);
  const rest = filtered.filter((g) => !g.is_promoted);

  if (selected) {
    return (
      <GameDetail
        game={selected}
        onBack={() => setSelected(null)}
        onPlay={handlePlay}
        onGameRunning={(gameId) => {
          if (gameId) {
            startHeartbeat(gameId);
          } else {
            stopHeartbeat();
          }
        }}
      />
    );
  }

  return (
    <div className="h-full flex flex-col">
      {/* Top bar */}
      <div className="flex items-center gap-3 px-6 py-3 bg-[#060a14] border-b-[3px] border-[#00e676] shrink-0 flex-nowrap" style={{boxShadow: '0 3px 15px rgba(0, 230, 118, 0.1)'}}>
        <div className="relative max-w-[400px] flex-1 min-w-[180px]">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[#64748b] text-sm">🔍</span>
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search games..."
            className="w-full pl-9 pr-4 py-2 bg-[#0a0e1a] border-2 border-[#1e3a5f] rounded text-sm text-white outline-none focus:border-[#00e676] placeholder:text-[#64748b]"
            style={{fontFamily: "'Silkscreen', monospace"}}
          />
        </div>
        <div className="flex-1" />
        <select
          value={sort}
          onChange={(e) => setSort(e.target.value as typeof sort)}
          className="px-4 py-2 bg-[#0a0e1a] border-2 border-[#1e3a5f] rounded text-xs text-[#94a3b8] outline-none cursor-pointer hover:border-[#00e676] shrink-0"
          style={{fontFamily: "'Silkscreen', monospace"}}
        >
          <option value="popular">Most Popular</option>
          <option value="newest">Newest</option>
          <option value="top-rated">Top Rated</option>
        </select>

        <div className="relative shrink-0">
          <button
            onClick={() => setShowTags(!showTags)}
            className={`px-4 py-2 rounded text-xs font-medium cursor-pointer transition-all border-2 ${
              activeTags.size > 0
                ? 'bg-[#00e676] border-[#00e676] text-black'
                : 'bg-[#0a0e1a] border-[#1e3a5f] text-[#94a3b8] hover:border-[#00e676]'
            }`}
            style={{fontFamily: "'Silkscreen', monospace"}}
          >
            Tags {activeTags.size > 0 ? `(${activeTags.size})` : ''}
          </button>
          {showTags && (
            <>
              <div className="fixed inset-0 z-40" onClick={() => setShowTags(false)} />
              <div className="absolute right-0 top-full mt-2 z-50 w-[320px] p-3 bg-[#111827] border-2 border-[#00e676] rounded shadow-xl" style={{borderBottom: '4px solid rgba(0,0,0,0.3)', boxShadow: '0 8px 32px rgba(0,0,0,0.5), 0 0 15px rgba(0, 230, 118, 0.15)'}}>
                <div className="flex flex-wrap gap-1.5">
                  {TAGS.map(tag => (
                    <button
                      key={tag}
                      onClick={() => toggleTag(tag)}
                      className={`px-2.5 py-1 rounded text-[11px] cursor-pointer transition-all border-2 ${
                        activeTags.has(tag.toLowerCase())
                          ? 'bg-[#00e676] border-[#00e676] text-black font-bold'
                          : 'bg-[#1a2235] border-[#1e3a5f] text-[#64748b] hover:border-[#00e676] hover:text-white'
                      }`}
                    >
                      {tag}
                    </button>
                  ))}
                </div>
                {activeTags.size > 0 && (
                  <button
                    onClick={() => setActiveTags(new Set())}
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
        {/* Featured banner */}
        {!search && featured.length > 0 && (
          <div className="px-6 pt-5 pb-2">
            <div
              onClick={() => setSelected(featured[0])}
              className="relative h-[220px] rounded overflow-hidden cursor-pointer group border-2 border-[#1e3a5f] hover:border-[#00e676]"
              style={{borderBottom: '4px solid rgba(0,0,0,0.3)', boxShadow: '0 0 20px rgba(0, 188, 212, 0.1)'}}
            >
              {featured[0].thumbnail_url ? (
                <img src={featured[0].thumbnail_url} alt={featured[0].title} className="absolute inset-0 w-full h-full object-cover" />
              ) : (
                <div className="absolute inset-0" style={{background: 'linear-gradient(135deg, #3a5f1e 0%, #2d4a17 50%, #1e3310 100%)'}} />
              )}
              <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/30 to-transparent" />
              <div className="absolute inset-0 flex items-end p-6">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="px-2 py-0.5 bg-[#ffd740] rounded text-[10px] font-bold text-black uppercase" style={{fontFamily: "'Silkscreen', monospace"}}>★ Featured</span>
                    <span className="flex items-center gap-1 text-xs text-[#94a3b8]">
                      <span className="w-1.5 h-1.5 rounded-full bg-[#00e676]" />
                      {featured[0].player_count || 0} playing
                    </span>
                  </div>
                  <h2 className="text-2xl font-bold mb-1" style={{fontFamily: "'Silkscreen', monospace", textShadow: '2px 2px 0 #000'}}>{featured[0].title}</h2>
                  <p className="text-sm text-[#94a3b8] line-clamp-2 max-w-lg">{featured[0].description}</p>
                </div>
                <button
                  onClick={(e) => { e.stopPropagation(); setSelected(featured[0]); }}
                  className="px-8 py-3 bg-[#00e676] hover:bg-[#33ff99] text-black font-bold rounded text-sm cursor-pointer border-b-[3px] border-[rgba(0,0,0,0.3)]"
                  style={{fontFamily: "'Silkscreen', monospace"}}
                >
                  ▶ PLAY
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Promoted row */}
        {!search && featured.length > 1 && (
          <div className="px-6 pt-4">
            <h2 className="text-base font-bold mb-3 flex items-center gap-2" style={{fontFamily: "'Silkscreen', monospace", color: '#ffd740'}}>
              ★ Sponsored
            </h2>
            <div className="grid grid-cols-[repeat(auto-fill,minmax(180px,1fr))] gap-4">
              {featured.slice(1).map((g) => (
                <GameCard key={g.id} game={g} onClick={setSelected} />
              ))}
            </div>
          </div>
        )}

        {/* All games / search results */}
        <div className="px-6 pt-5 pb-8">
          <h2 className="text-base font-bold mb-3" style={{fontFamily: "'Silkscreen', monospace", color: '#ffd740'}}>
            {search ? `Results for "${search}"` : "Popular Right Now"}
          </h2>
          {loading ? (
            <SkeletonGrid count={6} />
          ) : rest.length > 0 ? (
            <div className="grid grid-cols-[repeat(auto-fill,minmax(180px,1fr))] gap-4">
              {rest.map((g) => (
                <GameCard key={g.id} game={g} onClick={setSelected} />
              ))}
            </div>
          ) : (
            <div className="text-center py-16">
              <span className="text-4xl mb-3 block">⛏</span>
              <p className="text-[#64748b]" style={{fontFamily: "'Silkscreen', monospace"}}>No games found</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
