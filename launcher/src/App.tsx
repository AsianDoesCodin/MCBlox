import { useState, useEffect, useRef, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { check } from "@tauri-apps/plugin-updater";
import { relaunch } from "@tauri-apps/plugin-process";
import Sidebar from "./components/Sidebar";
import { ToastProvider } from "./components/Toast";
import Home from "./pages/Home";
import Settings from "./pages/Settings";
import type { Game } from "./types";
import { supabase } from "./lib/supabase";

interface ProgressPayload { stage: string; message: string; percent: number; }
interface LogPayload { message: string; }
interface McOutputPayload { line: string; stream: string; }
interface McExitedPayload { code: number; game_id: string; }

export interface GameSession {
  launching: boolean;
  gameRunning: boolean;
  progress: ProgressPayload | null;
  logs: string[];
  mcLogs: string[];
  sessionGameId: string | null;
}

type Page = "home" | "settings";

function App() {
  const [page, setPage] = useState<Page>("home");
  const [updateAvailable, setUpdateAvailable] = useState<{version: string} | null>(null);
  const [updating, setUpdating] = useState(false);
  const [updateProgress, setUpdateProgress] = useState("");
  const [mcUsername, setMcUsername] = useState<string | null>(null);

  // --- Game session state (lives here so it survives page switches) ---
  const [sessionGameId, setSessionGameId] = useState<string | null>(null);
  const [launching, setLaunching] = useState(false);
  const [gameRunning, setGameRunning] = useState(false);
  const [progress, setProgress] = useState<ProgressPayload | null>(null);
  const [logs, setLogs] = useState<string[]>([]);
  const [mcLogs, setMcLogs] = useState<string[]>([]);
  const launchUnsubs = useRef<(() => void)[]>([]);
  const heartbeatRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    checkForUpdates();
    invoke("mc_auth_get_account").then((acc: any) => {
      if (acc?.username) setMcUsername(acc.username);
    }).catch(() => {});
    // Check if a game is already running
    invoke<string | null>("is_game_running").then(id => {
      if (id) {
        setSessionGameId(id);
        setGameRunning(true);
      }
    });
    return () => stopHeartbeat();
  }, []);

  // Persistent listeners for mc-output and mc-exited (active for entire app lifetime)
  useEffect(() => {
    const unsubs: (() => void)[] = [];

    listen<McOutputPayload>("mc-output", (e) => {
      setMcLogs(prev => {
        const next = [...prev, e.payload.line];
        return next.length > 500 ? next.slice(-500) : next;
      });
    }).then(u => unsubs.push(u));

    listen<McExitedPayload>("mc-exited", (e) => {
      setGameRunning(false);
      setSessionGameId(prev => {
        if (prev === e.payload.game_id) {
          stopHeartbeat();
          const code = e.payload.code;
          setLogs(l => [...l, code === 0
            ? "✓ Minecraft closed normally."
            : `⚠ Minecraft exited with code ${code}`
          ]);
        }
        return prev;
      });
    }).then(u => unsubs.push(u));

    return () => { unsubs.forEach(u => u()); };
  }, []);

  async function startHeartbeat(gameId: string) {
    if (!supabase) return;
    const username = mcUsername;
    if (!username) return;
    await supabase.rpc("heartbeat", { p_game_id: gameId, p_mc_username: username });
    const sb = supabase;
    heartbeatRef.current = setInterval(async () => {
      await sb.rpc("heartbeat", { p_game_id: gameId, p_mc_username: username });
    }, 60000);
  }

  function stopHeartbeat() {
    if (heartbeatRef.current) {
      clearInterval(heartbeatRef.current);
      heartbeatRef.current = null;
    }
  }

  const handlePlay = useCallback(async (game: Game) => {
    setSessionGameId(game.id);
    setLaunching(true);
    setLogs([]);
    setMcLogs([]);
    setProgress(null);

    launchUnsubs.current.forEach(u => u());
    launchUnsubs.current = [];

    const unProgress = await listen<ProgressPayload>("launch-progress", (e) => {
      setProgress(e.payload);
      if (e.payload.stage === "running") {
        setGameRunning(true);
      }
    });
    launchUnsubs.current.push(unProgress);

    const unLog = await listen<LogPayload>("launch-log", (e) => {
      setLogs(prev => [...prev, e.payload.message]);
    });
    launchUnsubs.current.push(unLog);

    try {
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
          world_name: game.world_name || null,
          auto_join: game.auto_join || false,
        }
      });
      if (supabase) {
        await supabase.rpc("increment_plays", { game_id: game.id });
      }
      startHeartbeat(game.id);
      setLogs(prev => [...prev, "✓ Minecraft launched successfully!"]);
      return result;
    } catch (err: any) {
      setLogs(prev => [...prev, `✗ Error: ${err}`]);
      setProgress({ stage: "error", message: String(err), percent: 0 });
      throw err;
    } finally {
      setLaunching(false);
      launchUnsubs.current.forEach(u => u());
      launchUnsubs.current = [];
    }
  }, []);

  const handleStop = useCallback(async () => {
    try {
      await invoke("stop_game");
      setGameRunning(false);
      stopHeartbeat();
      setLogs(prev => [...prev, "⏹ Game stopped by user."]);
    } catch (err: any) {
      setLogs(prev => [...prev, `✗ Failed to stop: ${err}`]);
    }
  }, []);

  const gameSession: GameSession = {
    launching, gameRunning, progress, logs, mcLogs, sessionGameId,
  };

  async function checkForUpdates() {
    try {
      const update = await check();
      if (update) {
        setUpdateAvailable({ version: update.version });
      }
    } catch {
      // Silently fail
    }
  }

  async function installUpdate() {
    try {
      setUpdating(true);
      setUpdateProgress("Downloading update...");
      const update = await check();
      if (!update) return;
      
      let downloaded = 0;
      let contentLength = 0;
      await update.downloadAndInstall((event) => {
        switch (event.event) {
          case "Started":
            contentLength = event.data.contentLength || 0;
            setUpdateProgress(`Downloading... 0%`);
            break;
          case "Progress":
            downloaded += event.data.chunkLength;
            const pct = contentLength > 0 ? Math.round((downloaded / contentLength) * 100) : 0;
            setUpdateProgress(`Downloading... ${pct}%`);
            break;
          case "Finished":
            setUpdateProgress("Installing...");
            break;
        }
      });
      
      setUpdateProgress("Restarting...");
      await relaunch();
    } catch (e) {
      setUpdateProgress(`Update failed: ${e}`);
      setUpdating(false);
    }
  }

  return (
    <ToastProvider>
    <div className="flex h-screen flex-col">
      {updateAvailable && (
        <div className="flex items-center justify-center gap-3 px-4 py-2 bg-[#00e676] text-black text-sm shrink-0">
          {updating ? (
            <span>{updateProgress}</span>
          ) : (
            <>
              <span>McBlox v{updateAvailable.version} is available!</span>
              <button
                onClick={installUpdate}
                className="px-3 py-1 bg-black/20 rounded hover:bg-black/30 font-semibold cursor-pointer border-none text-black"
              >
                Install Update
              </button>
              <button
                onClick={() => setUpdateAvailable(null)}
                className="ml-2 opacity-70 hover:opacity-100 cursor-pointer bg-transparent border-none text-black"
              >✕</button>
            </>
          )}
        </div>
      )}
      <div className="flex flex-1 min-h-0">
        <Sidebar current={page} onNavigate={setPage} mcUsername={mcUsername} />
        <main className="flex-1 overflow-y-auto">
          {page === "home" && <Home session={gameSession} onPlay={handlePlay} onStop={handleStop} />}
          {page === "settings" && <Settings />}
        </main>
      </div>
    </div>
    </ToastProvider>
  );
}

export default App;
