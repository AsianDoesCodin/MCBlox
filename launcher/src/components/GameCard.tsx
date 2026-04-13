import { useState, useEffect, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { Game } from "../types";
import type { GameSession } from "../App";

interface Props {
  game: Game;
  onClick: (game: Game) => void;
  onPlay?: (game: Game) => void;
  onStop?: () => void;
  session?: GameSession;
}

export default function GameCard({ game, onClick, onPlay, onStop, session }: Props) {
  const likes = game.thumbs_up || 0;
  const total = likes + (game.thumbs_down || 0);
  const pct = total > 0 ? Math.round((likes / total) * 100) : 0;

  const isThisGame = session?.sessionGameId === game.id;
  const isLaunching = isThisGame && session?.launching;
  const isRunning = isThisGame && session?.gameRunning;
  const progressPct = isThisGame && session?.progress
    ? Math.round(session.progress.percent * 100)
    : 0;
  const progressMsg = isThisGame && session?.progress
    ? session.progress.message
    : "";

  // Context menu state
  const [ctxMenu, setCtxMenu] = useState<{ x: number; y: number } | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!ctxMenu) return;
    const close = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setCtxMenu(null);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [ctxMenu]);

  function handleCtxMenu(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    setCtxMenu({ x: e.clientX, y: e.clientY });
  }

  function ctxAction(fn: () => void) {
    setCtxMenu(null);
    fn();
  }

  return (
    <div
      onClick={() => onClick(game)}
      onContextMenu={handleCtxMenu}
      className="group cursor-pointer relative"
    >
      {/* Thumbnail */}
      <div className="relative aspect-video rounded-lg overflow-hidden mb-2 border-2 border-[rgba(184,169,232,0.10)] group-hover:border-[rgba(232,149,106,0.3)] transition-all"
        onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.boxShadow = '0 0 15px rgba(232,149,106,0.15)'; }}
        onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.boxShadow = 'none'; }}
      >
        {game.thumbnail_url ? (
          <img
            src={game.thumbnail_url}
            alt={game.title}
            className="w-full h-full object-cover"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center" style={{background: 'linear-gradient(135deg, #231a42 0%, #2d2250 50%, #1a1232 100%)'}}>
            <span className="text-4xl opacity-30">⛏</span>
          </div>
        )}
        {/* Hover play overlay — hide when launching/running */}
        {!isLaunching && !isRunning && (
          <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
            <div className="px-6 py-2 rounded-lg text-white font-bold text-sm" style={{background: 'linear-gradient(135deg, #e8956a, #d4709a)', boxShadow: '0 4px 16px rgba(232,149,106,0.4)'}}>
              PLAY
            </div>
          </div>
        )}
        {/* Launch/running overlay */}
        {(isLaunching || isRunning) && (
          <div className="absolute inset-0 bg-black/70 flex flex-col items-center justify-center gap-2 px-3">
            <span className="text-xs font-bold text-white">
              {isRunning ? "Playing" : "Installing..."}
            </span>
            {progressMsg && !isRunning && (
              <span className="text-[10px] text-[#c4bdd6] truncate max-w-full text-center">
                {progressMsg}
              </span>
            )}
            {!isRunning && (
              <div className="w-full mt-1">
                <div className="h-1.5 bg-[#1a1232] rounded-full overflow-hidden">
                  <div
                    className="h-full bg-[#e8956a] rounded-full transition-all duration-300"
                    style={{ width: `${progressPct}%` }}
                  />
                </div>
                <span className="text-[10px] text-[#8b82a8] block text-center mt-0.5">{progressPct}%</span>
              </div>
            )}
            {isRunning && (
              <span className="text-[10px] text-[#6fcf97] animate-pulse">● Running</span>
            )}
          </div>
        )}
        {/* Player count badge */}
        {game.game_type === 'server' && (game.player_count || 0) > 0 && (
          <div className="absolute bottom-1.5 right-1.5 flex items-center gap-1 px-2 py-0.5 bg-black/80 rounded text-[11px] font-medium" style={{backdropFilter: 'blur(4px)'}}>
            <span className="w-1.5 h-1.5 rounded-full bg-[#6fcf97] animate-pulse" />
            <span className="text-[#6fcf97]">{game.player_count}</span>
          </div>
        )}
        {/* Promoted badge */}
        {game.is_promoted && (
          <div className="absolute top-1.5 right-1.5 px-2 py-0.5 bg-[#f0c35e] rounded text-[10px] font-bold text-black uppercase">
            ⭐
          </div>
        )}
      </div>

      {/* Info */}
      <div className="px-0.5">
        <h3 className="text-[13px] font-bold truncate leading-tight">{game.title}</h3>
        <p className="text-[10px] text-[#8b82a8] truncate mt-0.5">{game.author || 'Unknown'}</p>
        <div className="flex items-center gap-2 mt-0.5">
          {total > 0 && (
            <span className={`text-[11px] font-medium flex items-center gap-0.5 ${pct >= 70 ? 'text-[#6fcf97]' : pct >= 40 ? 'text-[#f0c35e]' : 'text-red-400'}`}>
              <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor" stroke="none"><path d="M12 4l-8 8h5v8h6v-8h5z"/></svg>
              {pct}%
            </span>
          )}
          <span className="text-[11px] text-[#8b82a8] flex items-center gap-1">
            <span className={`w-1.5 h-1.5 rounded-full ${(game.player_count || 0) > 0 ? 'bg-[#6fcf97]' : 'bg-[#5c5478]'}`} />
            {game.player_count || 0} active
          </span>
          {game.tags && game.tags.length > 0 && (
            <span className="text-[11px] text-[#b8a9e8] truncate">
              {game.tags[0]}
            </span>
          )}
        </div>
        {/* Separator + game type */}
        <div className="border-t border-[rgba(184,169,232,0.10)] mt-1 pt-1 flex items-center gap-1.5">
          <span className="text-[10px] text-[#c4bdd6] px-1.5 py-0.5 rounded bg-[#2d2250] border border-[rgba(184,169,232,0.10)]">
            {game.game_type === 'server' ? 'Multiplayer' : 'Singleplayer'}
          </span>
        </div>
      </div>

      {/* Context menu */}
      {ctxMenu && (
        <div
          ref={menuRef}
          className="fixed z-50 bg-[#231a42] border-2 border-[rgba(184,169,232,0.15)] rounded-lg shadow-xl py-1 min-w-[160px]"
          style={{ left: ctxMenu.x, top: ctxMenu.y, boxShadow: '0 4px 20px rgba(0,0,0,0.6)' }}
        >
          {isRunning ? (
            <button
              className="w-full px-4 py-2 text-left text-xs text-[#e85d5d] hover:bg-[#2d2250] flex items-center gap-2"
              onClick={() => ctxAction(() => onStop?.())}
            >
              ⏹ Stop Game
            </button>
          ) : (
            <button
              className="w-full px-4 py-2 text-left text-xs text-[#e8956a] hover:bg-[#2d2250] flex items-center gap-2"
              onClick={() => ctxAction(() => onPlay?.(game))}
              disabled={isLaunching}
            >
              ▶ Play
            </button>
          )}
          <button
            className="w-full px-4 py-2 text-left text-xs text-white hover:bg-[#2d2250] flex items-center gap-2"
            onClick={() => ctxAction(() => onClick(game))}
          >
            📋 View Details
          </button>
          <button
            className="w-full px-4 py-2 text-left text-xs text-white hover:bg-[#2d2250] flex items-center gap-2"
            onClick={() => ctxAction(() => invoke("open_instance_folder", { gameId: game.id }).catch(() => {}))}
          >
            📁 Open Game Folder
          </button>
          <div className="border-t border-[rgba(184,169,232,0.10)] my-1" />
          <button
            className="w-full px-4 py-2 text-left text-xs text-[#e85d5d] hover:bg-[#2d2250] flex items-center gap-2"
            onClick={() => ctxAction(() => invoke("delete_instance", { gameId: game.id }).catch(() => {}))}
          >
            🗑 Clear Cache
          </button>
        </div>
      )}
    </div>
  );
}
