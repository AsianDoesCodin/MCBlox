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
      <div className="relative aspect-video rounded overflow-hidden mb-2 border-2 border-[#1e3a5f] group-hover:border-[#00bcd4] transition-all" style={{borderBottom: '4px solid rgba(0,0,0,0.3)', boxShadow: 'none'}}
        onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.boxShadow = '0 0 15px rgba(0, 188, 212, 0.25)'; }}
        onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.boxShadow = 'none'; }}
      >
        {game.thumbnail_url ? (
          <img
            src={game.thumbnail_url}
            alt={game.title}
            className="w-full h-full object-cover"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center" style={{background: 'linear-gradient(135deg, #0a1628 0%, #0f1f3a 50%, #061020 100%)'}}>
            <span className="text-4xl opacity-30">⛏</span>
          </div>
        )}
        {/* Hover play overlay — hide when launching/running */}
        {!isLaunching && !isRunning && (
          <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
            <div className="px-6 py-2 bg-[#00e676] rounded text-black font-bold text-sm" style={{fontFamily: "'Silkscreen', monospace", borderBottom: '3px solid rgba(0,0,0,0.3)', boxShadow: '0 0 15px rgba(0, 230, 118, 0.4)'}}>
              PLAY
            </div>
          </div>
        )}
        {/* Launch/running overlay */}
        {(isLaunching || isRunning) && (
          <div className="absolute inset-0 bg-black/70 flex flex-col items-center justify-center gap-2 px-3">
            <span className="text-xs font-bold text-white" style={{fontFamily: "'Silkscreen', monospace"}}>
              {isRunning ? "Playing" : "Installing..."}
            </span>
            {progressMsg && !isRunning && (
              <span className="text-[10px] text-[#94a3b8] truncate max-w-full text-center">
                {progressMsg}
              </span>
            )}
            {!isRunning && (
              <div className="w-full mt-1">
                <div className="h-1.5 bg-[#0a0e1a] rounded-full overflow-hidden">
                  <div
                    className="h-full bg-[#ff9800] rounded-full transition-all duration-300"
                    style={{ width: `${progressPct}%` }}
                  />
                </div>
                <span className="text-[10px] text-[#64748b] block text-center mt-0.5">{progressPct}%</span>
              </div>
            )}
            {isRunning && (
              <span className="text-[10px] text-[#00e676] animate-pulse">● Running</span>
            )}
          </div>
        )}
        {/* Multiplayer/Singleplayer label */}
        <div className="absolute top-1.5 left-1.5 flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-black/70 text-[10px] font-bold uppercase text-white"
          style={{fontFamily: "'Silkscreen', monospace", backdropFilter: 'blur(4px)', letterSpacing: '0.5px'}}>
          <span className="w-4 h-4 rounded-full bg-[#1e3a5f] flex items-center justify-center text-[8px] text-[#94a3b8]">
            {game.game_type === 'server' ? 'MP' : 'SP'}
          </span>
          {game.game_type === 'server' ? 'Multiplayer' : 'Singleplayer'}
        </div>
        {/* Player count badge */}
        {game.game_type === 'server' && (game.player_count || 0) > 0 && (
          <div className="absolute bottom-1.5 right-1.5 flex items-center gap-1 px-2 py-0.5 bg-black/80 rounded text-[11px] font-medium" style={{backdropFilter: 'blur(4px)'}}>
            <span className="w-1.5 h-1.5 rounded-full bg-[#00e676] animate-pulse" />
            <span className="text-[#00e676]">{game.player_count}</span>
          </div>
        )}
        {/* Promoted badge */}
        {game.is_promoted && (
          <div className="absolute top-1.5 right-1.5 px-2 py-0.5 bg-[#ffd740] rounded text-[10px] font-bold text-black uppercase" style={{fontFamily: "'Silkscreen', monospace"}}>
            ★
          </div>
        )}
      </div>

      {/* Info */}
      <div className="px-0.5">
        <h3 className="text-[13px] font-semibold truncate leading-tight" style={{fontFamily: "'Silkscreen', monospace", fontSize: '11px'}}>{game.title}</h3>
        <p className="text-[10px] text-[#64748b] truncate mt-0.5">by {game.author || 'Unknown'}</p>
        <div className="flex items-center gap-2 mt-0.5">
          {total > 0 && (
            <span className={`text-[11px] font-medium flex items-center gap-0.5 ${pct >= 70 ? 'text-[#00e676]' : pct >= 40 ? 'text-[#ffd740]' : 'text-red-400'}`}>
              <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor" stroke="none"><path d="M12 4l-8 8h5v8h6v-8h5z"/></svg>
              {pct}%
            </span>
          )}
          <span className="text-[11px] text-[#64748b] flex items-center gap-1">
            <span className={`w-1.5 h-1.5 rounded-full ${(game.player_count || 0) > 0 ? 'bg-[#00e676]' : 'bg-[#64748b]'}`} />
            {game.player_count || 0} active
          </span>
          {game.tags && game.tags.length > 0 && (
            <span className="text-[11px] text-[#64748b] truncate">
              {game.tags[0]}
            </span>
          )}
        </div>
      </div>

      {/* Context menu */}
      {ctxMenu && (
        <div
          ref={menuRef}
          className="fixed z-50 bg-[#111827] border-2 border-[#1e3a5f] rounded shadow-xl py-1 min-w-[160px]"
          style={{ left: ctxMenu.x, top: ctxMenu.y, boxShadow: '0 4px 20px rgba(0,0,0,0.6)' }}
        >
          {isRunning ? (
            <button
              className="w-full px-4 py-2 text-left text-xs text-[#ff5555] hover:bg-[#1a2235] flex items-center gap-2"
              style={{fontFamily: "'Silkscreen', monospace"}}
              onClick={() => ctxAction(() => onStop?.())}
            >
              ⏹ Stop Game
            </button>
          ) : (
            <button
              className="w-full px-4 py-2 text-left text-xs text-[#00e676] hover:bg-[#1a2235] flex items-center gap-2"
              style={{fontFamily: "'Silkscreen', monospace"}}
              onClick={() => ctxAction(() => onPlay?.(game))}
              disabled={isLaunching}
            >
              ▶ Play
            </button>
          )}
          <button
            className="w-full px-4 py-2 text-left text-xs text-white hover:bg-[#1a2235] flex items-center gap-2"
            style={{fontFamily: "'Silkscreen', monospace"}}
            onClick={() => ctxAction(() => onClick(game))}
          >
            📋 View Details
          </button>
          <button
            className="w-full px-4 py-2 text-left text-xs text-white hover:bg-[#1a2235] flex items-center gap-2"
            style={{fontFamily: "'Silkscreen', monospace"}}
            onClick={() => ctxAction(() => invoke("open_instance_folder", { gameId: game.id }).catch(() => {}))}
          >
            📁 Open Game Folder
          </button>
          <div className="border-t border-[#1e3a5f] my-1" />
          <button
            className="w-full px-4 py-2 text-left text-xs text-[#ff5555] hover:bg-[#1a2235] flex items-center gap-2"
            style={{fontFamily: "'Silkscreen', monospace"}}
            onClick={() => ctxAction(() => invoke("delete_instance", { gameId: game.id }).catch(() => {}))}
          >
            🗑 Clear Cache
          </button>
        </div>
      )}
    </div>
  );
}
