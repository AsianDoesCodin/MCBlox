import { useState, useEffect, useRef } from "react";
import { useToast } from "./Toast";
import type { Game } from "../types";
import { supabase } from "../lib/supabase";

interface ProgressPayload {
  stage: string;
  message: string;
  percent: number;
}

interface GameSession {
  launching: boolean;
  gameRunning: boolean;
  progress: ProgressPayload | null;
  logs: string[];
  mcLogs: string[];
  sessionGameId: string | null;
}

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
      <div className="flex items-center gap-3 px-6 py-3 bg-[#060a14] border-b-[3px] border-[#00e676] shrink-0" style={{boxShadow: '0 3px 15px rgba(0, 230, 118, 0.1)'}}>
        <button
          onClick={onBack}
          className="flex items-center gap-1.5 text-[#94a3b8] hover:text-white text-sm cursor-pointer"
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
            <div className="w-full h-full flex items-center justify-center" style={{background: 'linear-gradient(135deg, #0a1628 0%, #0f1f3a 50%, #061020 100%)'}}>
              <span className="text-7xl opacity-20">⛏</span>
            </div>
          )}
          <div className="absolute inset-0 bg-gradient-to-t from-[#0a0e1a] via-transparent to-transparent" />
        </div>

        <div className="px-8 -mt-16 relative pb-8 max-w-4xl">
          {/* Title + play */}
          <div className="flex items-end justify-between gap-6 mb-6">
            <div>
              <h1 className="text-2xl font-black tracking-wide" style={{fontFamily: "'Silkscreen', monospace", textShadow: '2px 2px 0 #000'}}>{game.title}</h1>
              <p className="text-sm text-[#64748b] mt-1">by {game.author || 'Unknown'}</p>
              <div className="flex items-center gap-4 mt-2 text-sm text-[#b0b0b0]">
                <span className="flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-[#00e676]" />
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
              className={`px-10 py-3.5 text-black font-bold rounded text-base cursor-pointer shrink-0 border-b-[4px] border-[rgba(0,0,0,0.3)] active:border-b-[2px] ${
                launching ? "bg-[#00e676]/70 opacity-70 cursor-not-allowed" :
                isThisGame && gameRunning ? "bg-[#cc3333] hover:bg-[#dd4444] text-white" :
                "bg-[#00e676] hover:bg-[#33ff99]"
              }`}
              style={{fontFamily: "'Silkscreen', monospace", boxShadow: launching ? 'none' : (isThisGame && gameRunning) ? 'none' : '0 0 15px rgba(0, 230, 118, 0.3)'}}
            >
              {launching ? "⏳ LAUNCHING..." : (isThisGame && gameRunning) ? "⏹ STOP" : "▶ PLAY"}
            </button>
          </div>

          {/* Stats row */}
          <div className="flex gap-3 mb-6">
            <button
              onClick={() => rate(true)}
              className={`flex items-center gap-2 px-4 py-2.5 rounded border-2 cursor-pointer transition-colors ${
                myRating === true
                  ? "bg-[#0a2618] border-[#00e676] text-[#00e676]"
                  : "bg-[#111827] border-[#1e3a5f] hover:border-[#00e676]"
              }`}
            >
              <span className="text-lg">👍</span>
              <span className="text-sm font-bold">{likes}</span>
            </button>
            <button
              onClick={() => rate(false)}
              className={`flex items-center gap-2 px-4 py-2.5 rounded border-2 cursor-pointer transition-colors ${
                myRating === false
                  ? "bg-[#1a0a0a] border-[#7a2e2e] text-[#ff5555]"
                  : "bg-[#111827] border-[#1e3a5f] hover:border-[#7a2e2e]"
              }`}
            >
              <span className="text-lg">👎</span>
              <span className="text-sm font-bold">{dislikes}</span>
            </button>
            <div className="flex items-center gap-2 px-4 py-2.5 bg-[#111827] rounded border-2 border-[#1e3a5f]">
              <span className="text-sm font-bold">{pct}%</span>
              <span className="text-[10px] text-[#64748b]">positive</span>
            </div>
            <div className="flex items-center gap-2 px-4 py-2.5 bg-[#111827] rounded border-2 border-[#1e3a5f]">
              <span className="text-lg">{game.game_type === 'server' ? '🌐' : '🗺️'}</span>
              <div>
                <p className="text-sm font-bold capitalize">{game.game_type}</p>
                <p className="text-[10px] text-[#64748b]">
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
                  className="text-xs px-3 py-1 bg-[#1a2235] rounded text-[#94a3b8] border-2 border-[#1e3a5f] hover:border-[#00e676] cursor-pointer transition-colors"
                >
                  {tag}
                </span>
              ))}
            </div>
          )}

          {/* Description */}
          <div className="bg-[#111827] rounded p-5 border-2 border-[#1e3a5f]" style={{borderBottom: '4px solid rgba(0,0,0,0.3)'}}>
            <h3 className="text-sm font-bold mb-2 text-[#ffd740] uppercase tracking-wide" style={{fontFamily: "'Silkscreen', monospace"}}>About</h3>
            <p className="text-sm text-[#e8e8e8] leading-relaxed">
              {game.description}
            </p>
          </div>

          {/* Progress bar + logs */}
          {showSession && (
            <div className="mt-5 space-y-3">
              {/* Progress bar */}
              {progress && (
                <div className="bg-[#111827] rounded p-4 border-2 border-[#1e3a5f]">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs text-[#94a3b8]" style={{fontFamily: "'Silkscreen', monospace"}}>
                      {progress.message}
                    </span>
                    <span className="text-xs text-[#64748b]">
                      {Math.round(progress.percent * 100)}%
                    </span>
                  </div>
                  <div className="h-2 bg-[#0a0e1a] rounded-full overflow-hidden">
                    <div
                      className={`h-full transition-all duration-300 rounded-full ${
                        progress.stage === "error" ? "bg-[#cc3333]" :
                        progress.stage === "running" ? "bg-[#00e676]" : "bg-[#00e676]"
                      }`}
                      style={{ width: `${Math.round(progress.percent * 100)}%` }}
                    />
                  </div>
                </div>
              )}

              {/* Logs area */}
              <div className="bg-[#060a14] rounded border-2 border-[#1e3a5f]">
                {/* Tab bar */}
                <div className="flex items-center border-b border-[#1e3a5f]">
                  <button
                    onClick={() => { setActiveTab("launcher"); setShowLogs(true); }}
                    className={`px-4 py-2 text-xs cursor-pointer transition-colors ${
                      activeTab === "launcher" ? "text-[#00e676] border-b-2 border-[#00e676]" : "text-[#64748b] hover:text-[#94a3b8]"
                    }`}
                    style={{fontFamily: "'Silkscreen', monospace"}}
                  >
                    LAUNCHER ({logs.length})
                  </button>
                  <button
                    onClick={() => { setActiveTab("minecraft"); setShowLogs(true); }}
                    className={`px-4 py-2 text-xs cursor-pointer transition-colors ${
                      activeTab === "minecraft" ? "text-[#00e676] border-b-2 border-[#00e676]" : "text-[#64748b] hover:text-[#94a3b8]"
                    }`}
                    style={{fontFamily: "'Silkscreen', monospace"}}
                  >
                    MINECRAFT {isThisGame && gameRunning && <span className="inline-block w-1.5 h-1.5 rounded-full bg-[#00e676] ml-1.5" />}
                    {mcLogs.length > 0 && ` (${mcLogs.length})`}
                  </button>
                  <div className="flex-1" />
                  <button
                    onClick={() => setShowLogs(!showLogs)}
                    className="px-3 py-2 text-xs text-[#64748b] hover:text-[#94a3b8] cursor-pointer"
                  >
                    {showLogs ? "▼" : "▶"}
                  </button>
                </div>
                {showLogs && activeTab === "launcher" && (
                  <div className="px-4 pb-3 max-h-[300px] overflow-y-auto font-mono text-xs leading-5">
                    {logs.length === 0 && (
                      <p className="text-[#1e3a5f] mt-2">Waiting for output...</p>
                    )}
                    {logs.map((log, i) => (
                      <p key={i} className={
                        log.startsWith("✗") ? "text-[#ff5555]" :
                        log.startsWith("✓") ? "text-[#00e676]" :
                        log.startsWith("⚠") ? "text-[#ffd740]" :
                        log.startsWith("⏹") ? "text-[#64748b]" : "text-[#94a3b8]"
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
                      <p className="text-[#1e3a5f] mt-2">{isThisGame && gameRunning ? "Waiting for Minecraft output..." : "No Minecraft output yet. Press Play to start."}</p>
                    )}
                    {mcLogs.map((log, i) => (
                      <p key={i} className={
                        log.includes("ERROR") || log.includes("Exception") ? "text-[#ff5555]" :
                        log.includes("WARN") ? "text-[#ffd740]" :
                        log.includes("[INFO]") ? "text-[#94a3b8]" : "text-[#64748b]"
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
