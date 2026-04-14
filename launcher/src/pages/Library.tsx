import { useState, useEffect, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { Game } from "../types";
import type { GameSession } from "../App";
import { supabase } from "../lib/supabase";

interface InstanceMeta {
  game_id: string;
  title: string;
  mc_version: string;
  mod_loader: string;
  game_type: string;
  server_address?: string;
  modpack_url: string;
  installed_at: string;
}

interface Props {
  session: GameSession;
  onPlay: (game: Game) => Promise<any>;
  onStop: () => Promise<void>;
}

export default function Library({ session, onPlay, onStop }: Props) {
  const [instances, setInstances] = useState<InstanceMeta[]>([]);
  const [games, setGames] = useState<Record<string, Game>>({});
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<"recent" | "name" | "version">("recent");
  const [ctxMenu, setCtxMenu] = useState<{ x: number; y: number; gameId: string } | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  async function loadInstances() {
    setLoading(true);
    try {
      const data = await invoke<InstanceMeta[]>("get_instances");
      setInstances(data);

      // Fetch game details from Supabase for thumbnails etc.
      if (data.length > 0 && supabase) {
        const ids = data.map(d => d.game_id);
        const { data: gamesData } = await supabase
          .from("games")
          .select("*, profiles:creator_id(username)")
          .in("id", ids);
        if (gamesData) {
          const map: Record<string, Game> = {};
          for (const g of gamesData) {
            map[g.id] = { ...g, author: g.profiles?.username || "Unknown" };
          }
          setGames(map);
        }
      }
    } catch (e) {
      console.error("Failed to load instances:", e);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { loadInstances(); }, []);

  // Close context menu on outside click
  useEffect(() => {
    if (!ctxMenu) return;
    const close = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setCtxMenu(null);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [ctxMenu]);

  async function handleDelete(gameId: string) {
    if (!confirm("Delete this game instance? You'll need to re-download it to play again.")) return;
    try {
      await invoke("delete_instance", { gameId });
      setInstances(prev => prev.filter(i => i.game_id !== gameId));
    } catch (e) {
      console.error("Failed to delete:", e);
    }
  }

  async function handleOpenFolder(gameId: string) {
    try {
      await invoke("open_instance_folder", { gameId });
    } catch (e) {
      console.error("Failed to open folder:", e);
    }
  }

  // Sort & filter
  let filtered = [...instances];
  if (search.trim()) {
    const q = search.toLowerCase();
    filtered = filtered.filter(i => i.title.toLowerCase().includes(q));
  }
  if (sort === "name") filtered.sort((a, b) => a.title.localeCompare(b.title));
  else if (sort === "version") filtered.sort((a, b) => a.mc_version.localeCompare(b.mc_version));
  else filtered.sort((a, b) => new Date(b.installed_at).getTime() - new Date(a.installed_at).getTime());

  return (
    <div className="p-6 max-w-[1100px]">
      {/* Header */}
      <div className="flex items-center justify-between mb-5">
        <div>
          <h1 className="text-2xl font-bold text-[#e8956a]">Library</h1>
          <p className="text-xs text-[#8b82a8] mt-1">
            {instances.length} game{instances.length !== 1 ? "s" : ""} installed
          </p>
        </div>
        <div className="flex gap-2">
          <input
            type="text"
            placeholder="Search installed..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="px-3 py-2 text-sm rounded-lg bg-[#1e1638] border border-[rgba(184,169,232,0.12)] text-[#f0edf7] placeholder-[#5c5478] focus:outline-none focus:border-[#e8956a] w-[200px]"
          />
          <select
            value={sort}
            onChange={e => setSort(e.target.value as any)}
            className="px-3 py-2 text-sm rounded-lg bg-[#1e1638] border border-[rgba(184,169,232,0.12)] text-[#f0edf7] cursor-pointer"
          >
            <option value="recent">Recently Installed</option>
            <option value="name">Name</option>
            <option value="version">MC Version</option>
          </select>
        </div>
      </div>

      {/* Loading */}
      {loading && (
        <div className="grid grid-cols-1 gap-3">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="h-[80px] rounded-xl bg-[#1e1638] animate-pulse" />
          ))}
        </div>
      )}

      {/* Empty */}
      {!loading && instances.length === 0 && (
        <div className="text-center py-16">
          <div className="text-4xl mb-3">📦</div>
          <h3 className="text-lg font-semibold text-[#f0edf7] mb-1">No games installed</h3>
          <p className="text-sm text-[#8b82a8]">Games you play will appear here.</p>
        </div>
      )}

      {/* No results */}
      {!loading && instances.length > 0 && filtered.length === 0 && (
        <div className="text-center py-12">
          <p className="text-sm text-[#8b82a8]">No installed games match your search.</p>
        </div>
      )}

      {/* Game list */}
      {!loading && filtered.length > 0 && (
        <div className="flex flex-col gap-2">
          {filtered.map(inst => {
            const game = games[inst.game_id];
            const isThisGame = session.sessionGameId === inst.game_id;
            const isLaunching = isThisGame && session.launching;
            const isRunning = isThisGame && session.gameRunning;
            const progressPct = isThisGame && session.progress ? Math.round(session.progress.percent * 100) : 0;

            return (
              <div
                key={inst.game_id}
                className={`group flex items-center gap-4 px-4 py-3 rounded-xl border transition-all ${
                  isRunning
                    ? "bg-[#1a2e1a] border-[rgba(111,207,151,0.3)]"
                    : "bg-[#1e1638] border-[rgba(184,169,232,0.08)] hover:border-[rgba(232,149,106,0.25)]"
                }`}
                onContextMenu={e => {
                  e.preventDefault();
                  setCtxMenu({ x: e.clientX, y: e.clientY, gameId: inst.game_id });
                }}
              >
                {/* Thumbnail */}
                <div className="w-14 h-14 rounded-lg bg-[#150e28] flex-shrink-0 overflow-hidden">
                  {game?.thumbnail_url ? (
                    <img src={game.thumbnail_url} alt="" className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-xl">⛏</div>
                  )}
                </div>

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <h3 className="text-sm font-semibold text-[#f0edf7] truncate">{inst.title}</h3>
                    {isRunning && (
                      <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-[rgba(111,207,151,0.15)] text-[#6fcf97]">
                        PLAYING
                      </span>
                    )}
                    {isLaunching && !isRunning && (
                      <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-[rgba(232,149,106,0.15)] text-[#e8956a]">
                        LAUNCHING {progressPct}%
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-3 text-[11px] text-[#8b82a8] mt-0.5">
                    <span>{inst.mc_version}</span>
                    <span className="capitalize">{inst.mod_loader}</span>
                    <span className="capitalize">{inst.game_type}</span>
                    {game?.author && <span>by {game.author}</span>}
                  </div>
                  <div className="text-[10px] text-[#5c5478] mt-0.5">
                    Installed {new Date(inst.installed_at).toLocaleDateString()}
                  </div>
                </div>

                {/* Actions */}
                <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                  {isRunning ? (
                    <button
                      onClick={() => onStop()}
                      className="px-4 py-2 rounded-lg text-xs font-semibold bg-[rgba(239,83,80,0.15)] text-[#ef5350] hover:bg-[rgba(239,83,80,0.25)] cursor-pointer transition-colors"
                    >
                      Stop
                    </button>
                  ) : isLaunching ? (
                    <button disabled className="px-4 py-2 rounded-lg text-xs font-semibold bg-[rgba(232,149,106,0.1)] text-[#e8956a] opacity-60 cursor-not-allowed">
                      Launching...
                    </button>
                  ) : (
                    <button
                      onClick={() => {
                        if (game) onPlay(game);
                      }}
                      disabled={!game || session.launching || session.gameRunning}
                      className="px-4 py-2 rounded-lg text-xs font-semibold text-white cursor-pointer transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                      style={{ background: "linear-gradient(135deg, #e8956a, #d4709a)" }}
                    >
                      ▶ Play
                    </button>
                  )}
                  <button
                    onClick={() => handleOpenFolder(inst.game_id)}
                    className="p-2 rounded-lg text-[#8b82a8] hover:text-[#f0edf7] hover:bg-[#231a42] cursor-pointer transition-colors"
                    title="Open folder"
                  >
                    📁
                  </button>
                  <button
                    onClick={() => handleDelete(inst.game_id)}
                    className="p-2 rounded-lg text-[#8b82a8] hover:text-[#ef5350] hover:bg-[rgba(239,83,80,0.1)] cursor-pointer transition-colors"
                    title="Delete"
                  >
                    🗑
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Context menu */}
      {ctxMenu && (
        <div
          ref={menuRef}
          className="fixed z-50 min-w-[160px] py-1 rounded-lg bg-[#231a42] border border-[rgba(184,169,232,0.15)] shadow-xl"
          style={{ left: ctxMenu.x, top: ctxMenu.y }}
        >
          <button
            className="w-full text-left px-4 py-2 text-xs text-[#f0edf7] hover:bg-[rgba(232,149,106,0.1)] cursor-pointer"
            onClick={() => { setCtxMenu(null); const g = games[ctxMenu.gameId]; if (g) onPlay(g); }}
          >
            ▶ Play
          </button>
          <button
            className="w-full text-left px-4 py-2 text-xs text-[#f0edf7] hover:bg-[rgba(232,149,106,0.1)] cursor-pointer"
            onClick={() => { setCtxMenu(null); handleOpenFolder(ctxMenu.gameId); }}
          >
            📁 Open Folder
          </button>
          <div className="border-t border-[rgba(184,169,232,0.1)] my-1" />
          <button
            className="w-full text-left px-4 py-2 text-xs text-[#ef5350] hover:bg-[rgba(239,83,80,0.1)] cursor-pointer"
            onClick={() => { setCtxMenu(null); handleDelete(ctxMenu.gameId); }}
          >
            🗑 Delete
          </button>
        </div>
      )}
    </div>
  );
}
