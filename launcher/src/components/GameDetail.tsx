import { useState, useEffect } from "react";
import type { Game } from "../types";
import { supabase } from "../lib/supabase";

interface Props {
  game: Game;
  onBack: () => void;
  onPlay: (game: Game) => void;
}

export default function GameDetail({ game, onBack, onPlay }: Props) {
  const [likes, setLikes] = useState(game.thumbs_up || 0);
  const [dislikes, setDislikes] = useState(game.thumbs_down || 0);
  const [myRating, setMyRating] = useState<boolean | null>(null); // true=like, false=dislike, null=none

  const total = likes + dislikes;
  const pct = total > 0 ? Math.round((likes / total) * 100) : 0;

  useEffect(() => {
    loadMyRating();
  }, [game.id]);

  async function loadMyRating() {
    if (!supabase) return;
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return;
    const { data } = await supabase
      .from("game_ratings")
      .select("is_positive")
      .eq("game_id", game.id)
      .eq("user_id", session.user.id)
      .maybeSingle();
    if (data) setMyRating(data.is_positive);
  }

  async function rate(positive: boolean) {
    if (!supabase) return;
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) { alert("Sign in to rate games"); return; }

    // Optimistic UI update
    const oldRating = myRating;
    if (oldRating === positive) return; // already rated same way

    if (oldRating === null) {
      // New rating
      if (positive) setLikes(l => l + 1); else setDislikes(d => d + 1);
    } else {
      // Changing rating
      if (positive) { setLikes(l => l + 1); setDislikes(d => d - 1); }
      else { setDislikes(d => d + 1); setLikes(l => l - 1); }
    }
    setMyRating(positive);

    const { error } = await supabase
      .from("game_ratings")
      .upsert({
        game_id: game.id,
        user_id: session.user.id,
        is_positive: positive,
      }, { onConflict: "game_id,user_id" });

    if (error) {
      // Revert
      setMyRating(oldRating);
      setLikes(game.thumbs_up || 0);
      setDislikes(game.thumbs_down || 0);
    }
  }

  return (
    <div className="h-full flex flex-col">
      {/* Top bar */}
      <div className="flex items-center gap-3 px-6 py-3 bg-[#1a1a1a] border-b-[3px] border-[#5b8731] shrink-0">
        <button
          onClick={onBack}
          className="flex items-center gap-1.5 text-[#b0b0b0] hover:text-white text-sm cursor-pointer"
          style={{fontFamily: "'Silkscreen', monospace"}}
        >
          <span>←</span> Back
        </button>
      </div>

      <div className="flex-1 overflow-y-auto">
        {/* Hero banner */}
        <div className="relative h-[260px]">
          {game.thumbnail_url ? (
            <img src={game.thumbnail_url} alt={game.title} className="w-full h-full object-cover" />
          ) : (
            <div className="w-full h-full flex items-center justify-center" style={{background: 'linear-gradient(135deg, #3a5f1e 0%, #2d4a17 50%, #1e3310 100%)'}}>
              <span className="text-7xl opacity-20">⛏</span>
            </div>
          )}
          <div className="absolute inset-0 bg-gradient-to-t from-[#2b2b2b] via-transparent to-transparent" />
        </div>

        <div className="px-8 -mt-16 relative pb-8 max-w-4xl">
          {/* Title + play */}
          <div className="flex items-end justify-between gap-6 mb-6">
            <div>
              <h1 className="text-2xl font-black tracking-wide" style={{fontFamily: "'Silkscreen', monospace", textShadow: '2px 2px 0 #000'}}>{game.title}</h1>
              <div className="flex items-center gap-4 mt-2 text-sm text-[#b0b0b0]">
                <span className="flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-[#55ff55]" />
                  {game.player_count || 0} active
                </span>
                <span>📥 {(game.total_plays || 0).toLocaleString()} plays</span>
                <span className="capitalize">{game.mod_loader}</span>
                <span>{game.mc_version}</span>
              </div>
            </div>
            <button
              onClick={() => onPlay(game)}
              className="px-10 py-3.5 bg-[#5b8731] hover:bg-[#6b9b3a] text-white font-bold rounded text-base cursor-pointer shrink-0 border-b-[4px] border-[rgba(0,0,0,0.3)] active:border-b-[2px]"
              style={{fontFamily: "'Silkscreen', monospace"}}
            >
              ▶ PLAY
            </button>
          </div>

          {/* Stats row */}
          <div className="flex gap-3 mb-6">
            <button
              onClick={() => rate(true)}
              className={`flex items-center gap-2 px-4 py-2.5 rounded border-2 cursor-pointer transition-colors ${
                myRating === true
                  ? "bg-[#2d5a11] border-[#5b8731] text-[#55ff55]"
                  : "bg-[#3a3a3a] border-[#555] hover:border-[#5b8731]"
              }`}
            >
              <span className="text-lg">👍</span>
              <span className="text-sm font-bold">{likes}</span>
            </button>
            <button
              onClick={() => rate(false)}
              className={`flex items-center gap-2 px-4 py-2.5 rounded border-2 cursor-pointer transition-colors ${
                myRating === false
                  ? "bg-[#5a1e1e] border-[#7a2e2e] text-[#ff5555]"
                  : "bg-[#3a3a3a] border-[#555] hover:border-[#7a2e2e]"
              }`}
            >
              <span className="text-lg">👎</span>
              <span className="text-sm font-bold">{dislikes}</span>
            </button>
            <div className="flex items-center gap-2 px-4 py-2.5 bg-[#3a3a3a] rounded border-2 border-[#555]">
              <span className="text-sm font-bold">{pct}%</span>
              <span className="text-[10px] text-[#808080]">positive</span>
            </div>
            <div className="flex items-center gap-2 px-4 py-2.5 bg-[#3a3a3a] rounded border-2 border-[#555]">
              <span className="text-lg">{game.game_type === 'server' ? '🌐' : '🗺️'}</span>
              <div>
                <p className="text-sm font-bold capitalize">{game.game_type}</p>
                <p className="text-[10px] text-[#808080]">
                  {game.game_type === 'server' ? game.server_address : game.world_name}
                </p>
              </div>
            </div>
          </div>

          {/* Tags */}
          {game.tags && game.tags.length > 0 && (
            <div className="flex gap-2 mb-5 flex-wrap">
              {game.tags.map((tag) => (
                <span
                  key={tag}
                  className="text-xs px-3 py-1 bg-[#484848] rounded text-[#b0b0b0] border-2 border-[#555] hover:border-[#5b8731] cursor-pointer transition-colors"
                >
                  {tag}
                </span>
              ))}
            </div>
          )}

          {/* Description */}
          <div className="bg-[#3a3a3a] rounded p-5 border-2 border-[#555]" style={{borderBottom: '4px solid rgba(0,0,0,0.3)'}}>
            <h3 className="text-sm font-bold mb-2 text-[#ffaa00] uppercase tracking-wide" style={{fontFamily: "'Silkscreen', monospace"}}>About</h3>
            <p className="text-sm text-[#e8e8e8] leading-relaxed">
              {game.description}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
