import { useState, useEffect, useRef } from "react";
import { useToast } from "./Toast";
import type { Game } from "../types";
import { supabase } from "../lib/supabase";
import type { GameSession } from "../App";

interface Props {
  game: Game;
  onBack: () => void;
  onPlay: (game: Game) => Promise<any>;
  onStop: () => Promise<void>;
  session: GameSession;
}

export default function GameDetail({ game, onBack, onPlay, onStop, session }: Props) {
  const { toast } = useToast();
  const [likes, setLikes] = useState(game.thumbs_up || 0);
  const [dislikes, setDislikes] = useState(game.thumbs_down || 0);
  const [myRating, setMyRating] = useState<boolean | null>(null);

  const { launching, gameRunning, progress, logs, mcLogs, sessionGameId } = session;
  const isThisGame = sessionGameId === game.id;
  const showSession = isThisGame && (launching || gameRunning || logs.length > 0 || mcLogs.length > 0);

  const [showLogs, setShowLogs] = useState(false);
  const [activeTab, setActiveTab] = useState<"launcher" | "minecraft">("launcher");
  const logsEndRef = useRef<HTMLDivElement>(null);
  const mcLogsEndRef = useRef<HTMLDivElement>(null);

  const total = likes + dislikes;
  const pct = total > 0 ? Math.round((likes / total) * 100) : 0;

  useEffect(() => {
    loadMyRating();
    // If this game has an active session, auto-show logs
    if (isThisGame && (gameRunning || logs.length > 0)) {
      setShowLogs(true);
      if (gameRunning) setActiveTab("minecraft");
    }
  }, [game.id]);

  // Auto-switch to minecraft tab when game starts running
  useEffect(() => {
    if (isThisGame && gameRunning) {
      setShowLogs(true);
      setActiveTab("minecraft");
    }
  }, [gameRunning, isThisGame]);

  // Auto-scroll logs
  useEffect(() => {
    logsEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [logs]);

  useEffect(() => {
    mcLogsEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [mcLogs]);

  async function handlePlay() {
    setShowLogs(true);
    setActiveTab("launcher");
    try {
      await onPlay(game);
    } catch {
      // errors handled in Home.tsx
    }
  }

  async function handleStop() {
    await onStop();
  }

  async function loadMyRating() {
    if (!supabase) return;
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return;
    const { data } = await supabase
      .from("ratings")
      .select("vote")
      .eq("game_id", game.id)
      .eq("user_id", session.user.id)
      .maybeSingle();
    if (data) setMyRating(data.vote === 'up');
  }

  async function rate(positive: boolean) {
    if (!supabase) return;
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) { toast("Sign in to rate games", "warning"); return; }

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
      .from("ratings")
      .upsert({
        game_id: game.id,
        user_id: session.user.id,
        vote: positive ? 'up' : 'down',
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
      <div className="flex items-center gap-3 px-6 py-3 bg-[#150e28] border-b-2 border-[rgba(184,169,232,0.10)] shrink-0">
        <button
          onClick={onBack}
          className="flex items-center gap-1.5 text-[#8b82a8] hover:text-white text-sm font-semibold cursor-pointer"
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
            <div className="w-full h-full flex items-center justify-center" style={{background: 'linear-gradient(135deg, #231a42 0%, #2d2250 50%, #1a1232 100%)'}}>
              <span className="text-7xl opacity-20">⛏</span>
            </div>
          )}
          <div className="absolute inset-0 bg-gradient-to-t from-[#1a1232] via-transparent to-transparent" />
        </div>

        <div className="px-8 -mt-16 relative pb-8 max-w-4xl">
          {/* Title + play */}
          <div className="flex items-end justify-between gap-6 mb-6">
            <div>
              <h1 className="text-2xl font-bold">{game.title}</h1>
              <p className="text-sm text-[#8b82a8] mt-1">{game.author || 'Unknown'}</p>
              <div className="flex items-center gap-4 mt-2 text-sm text-[#c4bdd6]">
                <span className="flex items-center gap-1.5">
                  <span className={`w-2 h-2 rounded-full ${(game.player_count || 0) > 0 ? 'bg-[#6fcf97]' : 'bg-[#5c5478]'}`} />
                  {game.player_count || 0} active
                </span>
                <span>📥 {(game.total_plays || 0).toLocaleString()} plays</span>
                <span className="capitalize">{game.mod_loader}</span>
                <span>{game.mc_version}</span>
              </div>
            </div>
            <button
              onClick={isThisGame && gameRunning ? handleStop : handlePlay}
              disabled={launching}
              className={`px-10 py-3.5 text-white font-bold rounded-lg text-base cursor-pointer shrink-0 ${
                launching ? "opacity-70 cursor-not-allowed" :
                isThisGame && gameRunning ? "bg-[#e85d5d] hover:bg-[#f07070]" : ""
              }`}
              style={{
                background: launching ? 'linear-gradient(135deg, #e8956a, #d4709a)' : (isThisGame && gameRunning) ? undefined : 'linear-gradient(135deg, #e8956a, #d4709a)',
                boxShadow: launching ? 'none' : (isThisGame && gameRunning) ? 'none' : '0 4px 20px rgba(232,149,106,0.3)'
              }}
            >
              {launching ? "⏳ Launching..." : (isThisGame && gameRunning) ? "⏹ Stop" : "▶ Play"}
            </button>
          </div>

          {/* Stats row */}
          <div className="flex gap-3 mb-6">
            <button
              onClick={() => rate(true)}
              className={`flex items-center gap-2 px-4 py-2.5 rounded-lg border-2 cursor-pointer transition-colors ${
                myRating === true
                  ? "bg-[rgba(111,207,151,0.1)] border-[#6fcf97] text-[#6fcf97]"
                  : "bg-[#231a42] border-[rgba(184,169,232,0.10)] hover:border-[#e8956a]"
              }`}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill={myRating === true ? "#6fcf97" : "none"} stroke={myRating === true ? "#6fcf97" : "currentColor"} strokeWidth="2"><path d="M12 4l-8 8h5v8h6v-8h5z"/></svg>
              <span className="text-sm font-bold">{likes}</span>
            </button>
            <button
              onClick={() => rate(false)}
              className={`flex items-center gap-2 px-4 py-2.5 rounded-lg border-2 cursor-pointer transition-colors ${
                myRating === false
                  ? "bg-[rgba(232,93,93,0.1)] border-[#e85d5d] text-[#e85d5d]"
                  : "bg-[#231a42] border-[rgba(184,169,232,0.10)] hover:border-[#e85d5d]"
              }`}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill={myRating === false ? "#e85d5d" : "none"} stroke={myRating === false ? "#e85d5d" : "currentColor"} strokeWidth="2"><path d="M12 20l8-8h-5V4H9v8H4z"/></svg>
              <span className="text-sm font-bold">{dislikes}</span>
            </button>
            <div className="flex items-center gap-2 px-4 py-2.5 bg-[#231a42] rounded-lg border-2 border-[rgba(184,169,232,0.10)]">
              <span className="text-sm font-bold">{pct}%</span>
              <span className="text-[10px] text-[#8b82a8]">positive</span>
            </div>
            <div className="flex items-center gap-2 px-4 py-2.5 bg-[#231a42] rounded-lg border-2 border-[rgba(184,169,232,0.10)]">
              <span className="text-lg">{game.game_type === 'server' ? '🌐' : '🗺️'}</span>
              <div>
                <p className="text-sm font-bold">{game.game_type === 'server' ? 'Multiplayer' : 'Singleplayer'}</p>
                <p className="text-[10px] text-[#8b82a8]">
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
                  className="text-xs px-3 py-1.5 bg-[rgba(184,169,232,0.08)] rounded-full text-[#b8a9e8] border border-[rgba(184,169,232,0.15)] hover:border-[#e8956a] cursor-pointer transition-colors"
                >
                  {tag}
                </span>
              ))}
            </div>
          )}

          {/* Description */}
          <div className="bg-[#231a42] rounded-lg p-5 border border-[rgba(184,169,232,0.10)]">
            <h3 className="text-sm font-bold mb-2 text-[#e8956a]">About</h3>
            <p className="text-sm text-[#c4bdd6] leading-relaxed">
              {game.description}
            </p>
          </div>

          {/* Progress bar + logs */}
          {showSession && (
            <div className="mt-5 space-y-3">
              {/* Progress bar */}
              {progress && (
                <div className="bg-[#231a42] rounded-lg p-4 border border-[rgba(184,169,232,0.10)]">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs text-[#c4bdd6]">
                      {progress.message}
                    </span>
                    <span className="text-xs text-[#8b82a8]">
                      {Math.round(progress.percent * 100)}%
                    </span>
                  </div>
                  <div className="h-2 bg-[#1a1232] rounded-full overflow-hidden">
                    <div
                      className={`h-full transition-all duration-300 rounded-full ${
                        progress.stage === "error" ? "bg-[#e85d5d]" :
                        progress.stage === "running" ? "bg-[#6fcf97]" : "bg-[#e8956a]"
                      }`}
                      style={{ width: `${Math.round(progress.percent * 100)}%` }}
                    />
                  </div>
                </div>
              )}

              {/* Logs area */}
              <div className="bg-[#231a42] rounded-lg border border-[rgba(184,169,232,0.10)]">
                {/* Tab bar */}
                <div className="flex items-center border-b border-[rgba(184,169,232,0.10)]">
                  <button
                    onClick={() => { setActiveTab("launcher"); setShowLogs(true); }}
                    className={`px-4 py-2 text-xs font-semibold cursor-pointer transition-colors ${
                      activeTab === "launcher" ? "text-[#e8956a] border-b-2 border-[#e8956a]" : "text-[#8b82a8] hover:text-[#c4bdd6]"
                    }`}
                  >
                    Launcher ({logs.length})
                  </button>
                  <button
                    onClick={() => { setActiveTab("minecraft"); setShowLogs(true); }}
                    className={`px-4 py-2 text-xs font-semibold cursor-pointer transition-colors ${
                      activeTab === "minecraft" ? "text-[#e8956a] border-b-2 border-[#e8956a]" : "text-[#8b82a8] hover:text-[#c4bdd6]"
                    }`}
                  >
                    Minecraft {isThisGame && gameRunning && <span className="inline-block w-1.5 h-1.5 rounded-full bg-[#6fcf97] ml-1.5" />}
                    {mcLogs.length > 0 && ` (${mcLogs.length})`}
                  </button>
                  <div className="flex-1" />
                  <button
                    onClick={() => setShowLogs(!showLogs)}
                    className="px-3 py-2 text-xs text-[#8b82a8] hover:text-[#c4bdd6] cursor-pointer"
                  >
                    {showLogs ? "▼" : "▶"}
                  </button>
                </div>
                {showLogs && activeTab === "launcher" && (
                  <div className="px-4 pb-3 max-h-[300px] overflow-y-auto font-mono text-xs leading-5">
                    {logs.length === 0 && (
                      <p className="text-[#5c5478] mt-2">Waiting for output...</p>
                    )}
                    {logs.map((log, i) => (
                      <p key={i} className={
                        log.startsWith("✗") ? "text-[#e85d5d]" :
                        log.startsWith("✓") ? "text-[#6fcf97]" :
                        log.startsWith("⚠") ? "text-[#f0c35e]" :
                        log.startsWith("⏹") ? "text-[#8b82a8]" : "text-[#c4bdd6]"
                      }>
                        {log}
                      </p>
                    ))}
                    <div ref={logsEndRef} />
                  </div>
                )}
                {showLogs && activeTab === "minecraft" && (
                  <div className="px-4 pb-3 max-h-[300px] overflow-y-auto font-mono text-xs leading-5">
                    {mcLogs.length === 0 && (
                      <p className="text-[#5c5478] mt-2">{isThisGame && gameRunning ? "Waiting for Minecraft output..." : "No Minecraft output yet. Press Play to start."}</p>
                    )}
                    {mcLogs.map((log, i) => (
                      <p key={i} className={
                        log.includes("ERROR") || log.includes("Exception") ? "text-[#e85d5d]" :
                        log.includes("WARN") ? "text-[#f0c35e]" :
                        log.includes("[INFO]") ? "text-[#c4bdd6]" : "text-[#8b82a8]"
                      }>
                        {log}
                      </p>
                    ))}
                    <div ref={mcLogsEndRef} />
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
