import type { Game } from "../types";

interface Props {
  game: Game;
  onClick: (game: Game) => void;
}

export default function GameCard({ game, onClick }: Props) {
  const likes = game.thumbs_up || 0;
  const total = likes + (game.thumbs_down || 0);
  const pct = total > 0 ? Math.round((likes / total) * 100) : 0;

  return (
    <div
      onClick={() => onClick(game)}
      className="group cursor-pointer"
    >
      {/* Thumbnail */}
      <div className="relative aspect-video rounded overflow-hidden mb-2 border-2 border-[#555] group-hover:border-[#5b8731] transition-all" style={{borderBottom: '4px solid rgba(0,0,0,0.3)'}}>
        {game.thumbnail_url ? (
          <img
            src={game.thumbnail_url}
            alt={game.title}
            className="w-full h-full object-cover"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center" style={{background: 'linear-gradient(135deg, #3a5f1e 0%, #2d4a17 50%, #1e3310 100%)'}}>
            <span className="text-4xl opacity-30">⛏</span>
          </div>
        )}
        {/* Hover play overlay */}
        <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
          <div className="px-6 py-2 bg-[#5b8731] rounded text-white font-bold text-sm" style={{fontFamily: "'Silkscreen', monospace", borderBottom: '3px solid rgba(0,0,0,0.3)'}}>
            PLAY
          </div>
        </div>
        {/* Player count badge */}
        {(game.player_count || 0) > 0 && (
          <div className="absolute bottom-1.5 left-1.5 flex items-center gap-1 px-2 py-0.5 bg-black/80 rounded text-[11px] font-medium">
            <span className="w-1.5 h-1.5 rounded-full bg-[#55ff55]" />
            {game.player_count} playing
          </div>
        )}
        {/* Promoted badge */}
        {game.is_promoted && (
          <div className="absolute top-1.5 right-1.5 px-2 py-0.5 bg-[#ffaa00] rounded text-[10px] font-bold text-black uppercase" style={{fontFamily: "'Silkscreen', monospace"}}>
            ★
          </div>
        )}
      </div>

      {/* Info */}
      <div className="px-0.5">
        <h3 className="text-[13px] font-semibold truncate leading-tight" style={{fontFamily: "'Silkscreen', monospace", fontSize: '11px'}}>{game.title}</h3>
        <div className="flex items-center gap-2 mt-0.5">
          {total > 0 && (
            <span className={`text-[11px] font-medium ${pct >= 70 ? 'text-[#55ff55]' : pct >= 40 ? 'text-[#ffaa00]' : 'text-red-400'}`}>
              👍 {pct}%
            </span>
          )}
          {game.tags && game.tags.length > 0 && (
            <span className="text-[11px] text-[#808080] truncate">
              {game.tags[0]}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
