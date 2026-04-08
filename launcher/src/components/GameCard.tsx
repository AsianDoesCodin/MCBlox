import type { Game } from "../types";
import type { GameSession } from "../App";

interface Props {
  game: Game;
  onClick: (game: Game) => void;
  session?: GameSession;
}

export default function GameCard({ game, onClick, session }: Props) {
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

  return (
    <div
      onClick={() => onClick(game)}
      className="group cursor-pointer"
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
        {/* Player count badge */}
        {(game.player_count || 0) > 0 && (
          <div className="absolute bottom-1.5 left-1.5 flex items-center gap-1 px-2 py-0.5 bg-black/80 rounded text-[11px] font-medium">
            <span className="w-1.5 h-1.5 rounded-full bg-[#00e676]" />
            {game.player_count} playing
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
            <span className={`text-[11px] font-medium ${pct >= 70 ? 'text-[#00e676]' : pct >= 40 ? 'text-[#ffd740]' : 'text-red-400'}`}>
              👍 {pct}%
            </span>
          )}
          {game.tags && game.tags.length > 0 && (
            <span className="text-[11px] text-[#64748b] truncate">
              {game.tags[0]}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
