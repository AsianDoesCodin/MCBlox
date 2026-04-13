import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { check } from "@tauri-apps/plugin-updater";
import { relaunch } from "@tauri-apps/plugin-process";
import { useToast } from "../components/Toast";
import { supabase } from "../lib/supabase";
import type { User } from "@supabase/supabase-js";

interface McAccount {
  username: string;
  uuid: string;
  access_token: string;
}

interface StorageInfo {
  instances: number;
  libraries: number;
  assets: number;
  java: number;
  total: number;
  path: string;
}

interface GlobalMcSettings {
  enabled: boolean;
  fov: number | null;
  render_distance: number | null;
  simulation_distance: number | null;
  entity_distance: number | null;
  graphics: string | null;
  gui_scale: number | null;
  sensitivity: number | null;
  difficulty: number | null;
  fullscreen: boolean | null;
  fov_effect: number | null;
  vsync: boolean | null;
  entity_shadows: boolean | null;
  view_bobbing: boolean | null;
  brightness: number | null;
  keybinds: Record<string, string> | null;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

export default function Settings() {
  const { toast } = useToast();
  const [mcAccount, setMcAccount] = useState<McAccount | null>(null);
  const [authState, setAuthState] = useState<"idle" | "waiting" | "polling">("idle");
  const [authError, setAuthError] = useState<string | null>(null);
  const [deviceCode, setDeviceCode] = useState<{user_code: string; verification_uri: string} | null>(null);

  // McBlox account
  const [mcbloxUser, setMcbloxUser] = useState<User | null>(null);
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [isSignUp, setIsSignUp] = useState(false);
  const [authEmail, setAuthEmail] = useState("");
  const [authPassword, setAuthPassword] = useState("");
  const [authUsername, setAuthUsername] = useState("");
  const [authLoading, setAuthLoading] = useState(false);
  const [authModalError, setAuthModalError] = useState("");
  
  // Storage
  const [storageInfo, setStorageInfo] = useState<StorageInfo | null>(null);
  const [clearing, setClearing] = useState(false);
  
  // Updates
  const [checkingUpdate, setCheckingUpdate] = useState(false);
  const [updateResult, setUpdateResult] = useState<string | null>(null);

  // Global MC settings
  const [mcSettings, setMcSettings] = useState<GlobalMcSettings>({
    enabled: false, fov: null, render_distance: null, simulation_distance: null,
    entity_distance: null, graphics: null,
    gui_scale: null, sensitivity: null, difficulty: null, fullscreen: null,
    fov_effect: null, vsync: null, entity_shadows: null, view_bobbing: null,
    brightness: null, keybinds: null,
  });
  const [showKeybinds, setShowKeybinds] = useState(false);
  const [listeningKey, setListeningKey] = useState<string | null>(null);

  useEffect(() => {
    // Check for saved MC account
    invoke("mc_auth_get_account").then((acc: any) => {
      if (acc) setMcAccount(acc);
    }).catch(() => {});

    // Check if MC auth is in progress (e.g. user navigated away and back)
    invoke("mc_auth_status").then((status: any) => {
      if (status.state === "polling" || status.state === "authenticating") {
        setAuthState("polling");
      } else if (status.state === "done" && status.account) {
        setMcAccount(status.account);
        setAuthState("idle");
      } else if (status.state === "error" && status.error) {
        setAuthError(status.error);
        setAuthState("idle");
      }
    }).catch(() => {});

    // Check McBlox auth
    if (supabase) {
      supabase.auth.getSession().then(({ data: { session } }) => {
        setMcbloxUser(session?.user || null);
      });
      supabase.auth.onAuthStateChange((_event, session) => {
        setMcbloxUser(session?.user || null);
      });
    }

    // Load storage info
    loadStorageInfo();

    // Load global MC settings
    invoke<GlobalMcSettings>("get_global_mc_settings").then(s => setMcSettings(s)).catch(() => {});
  }, []);

  async function loadStorageInfo() {
    try {
      const info: any = await invoke("get_storage_info");
      setStorageInfo(info);
    } catch {}
  }

  function updateMcSetting<K extends keyof GlobalMcSettings>(key: K, value: GlobalMcSettings[K]) {
    setMcSettings(prev => {
      const next = { ...prev, [key]: value };
      // Auto-save
      invoke("save_global_mc_settings", { settings: next }).catch(() => {});
      return next;
    });
  }

  async function clearCache() {
    if (!confirm("This will delete all downloaded game instances. You'll need to re-download them when you play. Continue?")) return;
    setClearing(true);
    try {
      const result = await invoke("clear_all_instances");
      toast(String(result), "success");
      loadStorageInfo();
    } catch (e) {
      toast(`Failed: ${e}`, "error");
    }
    setClearing(false);
  }

  async function checkForUpdates() {
    setCheckingUpdate(true);
    setUpdateResult(null);
    try {
      const update = await check();
      if (update) {
        setUpdateResult(`v${update.version} available! Installing...`);
        let downloaded = 0;
        let contentLength = 0;
        await update.downloadAndInstall((event) => {
          switch (event.event) {
            case "Started":
              contentLength = event.data.contentLength || 0;
              break;
            case "Progress":
              downloaded += event.data.chunkLength;
              const pct = contentLength > 0 ? Math.round((downloaded / contentLength) * 100) : 0;
              setUpdateResult(`Downloading... ${pct}%`);
              break;
            case "Finished":
              setUpdateResult("Installing...");
              break;
          }
        });
        setUpdateResult("Restarting...");
        await relaunch();
      } else {
        setUpdateResult("You're on the latest version!");
      }
    } catch (e) {
      setUpdateResult(`Update check failed: ${e}`);
    }
    setCheckingUpdate(false);
  }

  async function startMcAuth() {
    try {
      setAuthState("waiting");
      setAuthError(null);
      const code: any = await invoke("mc_auth_start_device_flow");
      if (!code.user_code) {
        throw new Error("No device code received from Microsoft");
      }
      setDeviceCode({ user_code: code.user_code, verification_uri: code.verification_uri });
      setAuthState("polling");

      // Open browser
      window.open(code.verification_uri, "_blank");

      // Poll for completion
      const account: any = await invoke("mc_auth_poll", {
        deviceCode: code.device_code,
        interval: code.interval || 5,
      });
      setMcAccount(account);
      setAuthState("idle");
      setDeviceCode(null);
      setAuthError(null);
    } catch (e: any) {
      setAuthError(typeof e === "string" ? e : e?.message || "Auth failed");
      setAuthState("idle");
      setDeviceCode(null);
    }
  }

  async function logoutMc() {
    await invoke("mc_auth_logout");
    setMcAccount(null);
  }

  async function handleMcbloxAuth(e: React.FormEvent) {
    e.preventDefault();
    if (!supabase) {
      setAuthModalError("Supabase not configured");
      return;
    }
    setAuthLoading(true);
    setAuthModalError("");
    try {
      if (isSignUp) {
        if (!authUsername.trim()) throw new Error("Username required");
        const { error } = await supabase.auth.signUp({
          email: authEmail, password: authPassword,
          options: { data: { username: authUsername.trim() } }
        });
        if (error) throw error;
        setShowAuthModal(false);
        setAuthEmail(""); setAuthPassword(""); setAuthUsername("");
      } else {
        const { error } = await supabase.auth.signInWithPassword({
          email: authEmail, password: authPassword
        });
        if (error) throw error;
        setShowAuthModal(false);
        setAuthEmail(""); setAuthPassword("");
      }
    } catch (err: any) {
      setAuthModalError(err.message || "Something went wrong");
    }
    setAuthLoading(false);
  }

  async function mcbloxSignOut() {
    if (supabase) await supabase.auth.signOut();
  }

  return (
    <div className="h-full flex flex-col">
      {/* Top bar */}
      <div className="flex items-center gap-3 px-6 py-3 bg-[#150e28] border-b-2 border-[rgba(184,169,232,0.10)] shrink-0" >
        <h1 className="text-base font-bold" style={{color: '#f0c35e'}}>Settings</h1>
      </div>

      <div className="flex-1 overflow-y-auto p-6">
        <div className="max-w-4xl mx-auto space-y-5">
          {/* Minecraft Account */}
          <div className="bg-[#231a42] rounded p-5 border-2 border-[rgba(184,169,232,0.10)]" >
            <div className="flex items-center gap-4">
              {mcAccount ? (
                <>
                  <img
                    src={`https://mc-heads.net/avatar/${mcAccount.uuid}/44`}
                    alt={mcAccount.username}
                    className="w-11 h-11 rounded"
                    style={{imageRendering: 'pixelated'}}
                  />
                  <div className="flex-1">
                    <h2 className="font-bold text-sm text-white">{mcAccount.username}</h2>
                    <p className="text-xs text-[#e8956a] mt-0.5">Signed in</p>
                  </div>
                  <button
                    onClick={logoutMc}
                    className="px-5 py-2 bg-[rgba(232,93,93,0.08)] hover:bg-[rgba(232,93,93,0.12)] border-2 border-[rgba(232,93,93,0.3)] rounded text-sm font-medium cursor-pointer text-[#e85d5d]"
                  >
                    Sign Out
                  </button>
                </>
              ) : authState === "polling" && deviceCode ? (
                <>
                  <div className="w-11 h-11 rounded bg-[#2d2250] flex items-center justify-center text-xl shrink-0 animate-pulse">
                    ⛏
                  </div>
                  <div className="flex-1">
                    <h2 className="font-bold text-sm">Enter this code:</h2>
                    <p className="text-lg font-mono font-bold text-[#e8956a] mt-1 tracking-widest">
                      {deviceCode.user_code}
                    </p>
                    <p className="text-xs text-[#8b82a8] mt-1">
                      at <a
                        href={deviceCode.verification_uri}
                        target="_blank"
                        rel="noreferrer"
                        className="text-[#b8a9e8] underline hover:text-[#dab9ef] cursor-pointer"
                      >{deviceCode.verification_uri}</a>
                    </p>
                  </div>
                  <div className="text-xs text-[#8b82a8] animate-pulse">Waiting...</div>
                </>
              ) : (
                <>
                  <div className="w-11 h-11 rounded bg-[#2d2250] flex items-center justify-center text-xl shrink-0">
                    ⛏
                  </div>
                  <div className="flex-1">
                    <h2 className="font-bold text-sm">Minecraft Account</h2>
                    <p className="text-xs text-[#8b82a8] mt-0.5">Sign in with Microsoft to play online</p>
                  </div>
                  <button
                    onClick={startMcAuth}
                    disabled={authState !== "idle"}
                    className="px-5 py-2 bg-[#2d2250] hover:bg-[#352960] border-2 border-[rgba(184,169,232,0.10)] rounded text-sm font-medium cursor-pointer "
                  >
                    Sign in with Microsoft
                  </button>
                </>
              )}
            </div>
          </div>

          {/* MC Auth Error */}
          {authError && (
            <div className="bg-[rgba(232,93,93,0.08)] border-2 border-[rgba(232,93,93,0.3)] rounded p-3 text-sm text-[#e85d5d]">
              MC Auth Error: {authError}
            </div>
          )}

          {/* McBlox Account */}
          <div className="bg-[#231a42] rounded p-5 border-2 border-[rgba(184,169,232,0.10)]" >
            <div className="flex items-center gap-4">
              <img src="/mcbloxlogo2.png" alt="McBlox" className="w-11 h-11 rounded-full shrink-0" />
              {mcbloxUser ? (
                <>
                  <div className="flex-1">
                    <h2 className="font-bold text-sm">{mcbloxUser.user_metadata?.username || mcbloxUser.email?.split("@")[0]}</h2>
                    <p className="text-xs text-[#e8956a] mt-0.5">Signed in</p>
                  </div>
                  <button
                    onClick={mcbloxSignOut}
                    className="px-5 py-2 bg-[rgba(232,93,93,0.08)] hover:bg-[rgba(232,93,93,0.12)] border-2 border-[rgba(232,93,93,0.3)] rounded text-sm font-medium cursor-pointer text-[#e85d5d]"
                  >
                    Sign Out
                  </button>
                </>
              ) : (
                <>
                  <div className="flex-1">
                    <h2 className="font-bold text-sm">McBlox Account</h2>
                    <p className="text-xs text-[#8b82a8] mt-0.5">Rate games and publish</p>
                  </div>
                  <button
                    onClick={() => setShowAuthModal(true)}
                    className="px-5 py-2 bg-[#e8956a] hover:bg-[#f0a87e] rounded text-black text-sm font-semibold cursor-pointer "
                   
                  >
                    Sign In
                  </button>
                </>
              )}
            </div>
          </div>

          {/* Performance */}
          <div className="bg-[#231a42] rounded p-5 border-2 border-[rgba(184,169,232,0.10)]" >
            <h2 className="font-bold text-sm mb-4 flex items-center gap-2" style={{color: '#f0c35e'}}>
              ⚡ Performance
            </h2>
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium">Java Memory</p>
                  <p className="text-xs text-[#8b82a8]">RAM allocated to Minecraft</p>
                </div>
                <select
                  className="px-3 py-1.5 bg-[#1a1232] border-2 border-[rgba(184,169,232,0.10)] rounded text-xs text-white outline-none cursor-pointer"
                  defaultValue={localStorage.getItem("mcblox-ram") || "4G"}
                  onChange={(e) => localStorage.setItem("mcblox-ram", e.target.value)}
                >
                  <option value="2G">2 GB</option>
                  <option value="3G">3 GB</option>
                  <option value="4G">4 GB</option>
                  <option value="6G">6 GB</option>
                  <option value="8G">8 GB</option>
                  <option value="12G">12 GB</option>
                  <option value="16G">16 GB</option>
                </select>
              </div>
            </div>
          </div>

          {/* Global Minecraft Settings */}
          <div className="bg-[#231a42] rounded p-5 border-2 border-[rgba(184,169,232,0.10)]" >
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-bold text-sm flex items-center gap-2" style={{color: '#f0c35e'}}>
                🎮 Global Minecraft Settings
              </h2>
              <label className="flex items-center gap-2 cursor-pointer">
                <span className="text-xs text-[#8b82a8]">{mcSettings.enabled ? "On" : "Off"}</span>
                <div className="relative">
                  <input
                    type="checkbox"
                    checked={mcSettings.enabled}
                    onChange={(e) => updateMcSetting("enabled", e.target.checked)}
                    className="sr-only peer"
                  />
                  <div className="w-10 h-5 bg-[#2d2250] rounded peer-checked:bg-[#e8956a] transition-colors" />
                  <div className="absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded peer-checked:translate-x-5 transition-transform" />
                </div>
              </label>
            </div>
            {!mcSettings.enabled ? (
              <p className="text-xs text-[#8b82a8]">Enable to override in-game settings (FOV, graphics, sensitivity, etc.) for all games on launch.</p>
            ) : (
              <div className="space-y-4">
                {/* FOV */}
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium">FOV</p>
                    <p className="text-xs text-[#8b82a8]">Field of view (30-110, default 70)</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <input
                      type="range" min="30" max="110" step="1"
                      value={mcSettings.fov ?? 70}
                      onChange={(e) => updateMcSetting("fov", Number(e.target.value))}
                      className="w-28 accent-[#e8956a]"
                    />
                    <span className="text-xs text-white w-8 text-right">{mcSettings.fov ?? 70}</span>
                  </div>
                </div>
                {/* Render Distance */}
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium">Render Distance</p>
                    <p className="text-xs text-[#8b82a8]">Chunks (2-32, default 12)</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <input
                      type="range" min="2" max="32" step="1"
                      value={mcSettings.render_distance ?? 12}
                      onChange={(e) => updateMcSetting("render_distance", Number(e.target.value))}
                      className="w-28 accent-[#e8956a]"
                    />
                    <span className="text-xs text-white w-8 text-right">{mcSettings.render_distance ?? 12}</span>
                  </div>
                </div>
                {/* Simulation Distance */}
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium">Simulation Distance</p>
                    <p className="text-xs text-[#8b82a8]">Chunks (5-32, default 12)</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <input
                      type="range" min="5" max="32" step="1"
                      value={mcSettings.simulation_distance ?? 12}
                      onChange={(e) => updateMcSetting("simulation_distance", Number(e.target.value))}
                      className="w-28 accent-[#e8956a]"
                    />
                    <span className="text-xs text-white w-8 text-right">{mcSettings.simulation_distance ?? 12}</span>
                  </div>
                </div>
                {/* Entity Distance */}
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium">Entity Distance</p>
                    <p className="text-xs text-[#8b82a8]">Scaling (50%-500%, default 100%)</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <input
                      type="range" min="0.5" max="5.0" step="0.25"
                      value={mcSettings.entity_distance ?? 1.0}
                      onChange={(e) => updateMcSetting("entity_distance", Number(e.target.value))}
                      className="w-28 accent-[#e8956a]"
                    />
                    <span className="text-xs text-white w-10 text-right">{Math.round((mcSettings.entity_distance ?? 1.0) * 100)}%</span>
                  </div>
                </div>
                {/* Graphics */}
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium">Graphics</p>
                    <p className="text-xs text-[#8b82a8]">Rendering quality</p>
                  </div>
                  <select
                    value={mcSettings.graphics ?? "fancy"}
                    onChange={(e) => updateMcSetting("graphics", e.target.value)}
                    className="px-3 py-1.5 bg-[#1a1232] border-2 border-[rgba(184,169,232,0.10)] rounded text-xs text-white outline-none cursor-pointer"
                  >
                    <option value="fast">Fast</option>
                    <option value="fancy">Fancy</option>
                    <option value="fabulous">Fabulous</option>
                  </select>
                </div>
                {/* GUI Scale */}
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium">GUI Scale</p>
                    <p className="text-xs text-[#8b82a8]">0=Auto, 1-4=fixed</p>
                  </div>
                  <select
                    value={mcSettings.gui_scale ?? 0}
                    onChange={(e) => updateMcSetting("gui_scale", Number(e.target.value))}
                    className="px-3 py-1.5 bg-[#1a1232] border-2 border-[rgba(184,169,232,0.10)] rounded text-xs text-white outline-none cursor-pointer"
                  >
                    <option value={0}>Auto</option>
                    <option value={1}>Small</option>
                    <option value={2}>Normal</option>
                    <option value={3}>Large</option>
                    <option value={4}>Huge</option>
                  </select>
                </div>
                {/* Sensitivity */}
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium">Mouse Sensitivity</p>
                    <p className="text-xs text-[#8b82a8]">0%-200% (default 100%)</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <input
                      type="range" min="0" max="1" step="0.01"
                      value={mcSettings.sensitivity ?? 0.5}
                      onChange={(e) => updateMcSetting("sensitivity", Number(e.target.value))}
                      className="w-28 accent-[#e8956a]"
                    />
                    <span className="text-xs text-white w-10 text-right">{Math.round((mcSettings.sensitivity ?? 0.5) * 200)}%</span>
                  </div>
                </div>
                {/* Toggle row: Fullscreen, VSync, Entity Shadows, View Bobbing */}
                <div className="grid grid-cols-2 gap-3">
                  {([
                    ["fullscreen", "Fullscreen", mcSettings.fullscreen],
                    ["vsync", "VSync", mcSettings.vsync],
                    ["entity_shadows", "Entity Shadows", mcSettings.entity_shadows],
                    ["view_bobbing", "View Bobbing", mcSettings.view_bobbing],
                  ] as [keyof GlobalMcSettings, string, boolean | null][]).map(([key, label, val]) => (
                    <label key={key} className="flex items-center justify-between cursor-pointer bg-[#1a1232] rounded px-3 py-2 border border-[rgba(184,169,232,0.10)]">
                      <span className="text-xs font-medium">{label}</span>
                      <div className="relative">
                        <input
                          type="checkbox"
                          checked={val ?? (key === "view_bobbing" || key === "entity_shadows")}
                          onChange={(e) => updateMcSetting(key, e.target.checked as any)}
                          className="sr-only peer"
                        />
                        <div className="w-8 h-4 bg-[#2d2250] rounded peer-checked:bg-[#e8956a] transition-colors" />
                        <div className="absolute top-0.5 left-0.5 w-3 h-3 bg-white rounded peer-checked:translate-x-4 transition-transform" />
                      </div>
                    </label>
                  ))}
                </div>
                {/* FOV Effect Scale */}
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium">FOV Effects</p>
                    <p className="text-xs text-[#8b82a8]">Speed/potion FOV change (0-1)</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <input
                      type="range" min="0" max="1" step="0.05"
                      value={mcSettings.fov_effect ?? 1}
                      onChange={(e) => updateMcSetting("fov_effect", Number(e.target.value))}
                      className="w-28 accent-[#e8956a]"
                    />
                    <span className="text-xs text-white w-10 text-right">{Math.round((mcSettings.fov_effect ?? 1) * 100)}%</span>
                  </div>
                </div>
                {/* Brightness */}
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium">Brightness</p>
                    <p className="text-xs text-[#8b82a8]">0% = Moody, 100% = Bright</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <input
                      type="range" min="0" max="1" step="0.05"
                      value={mcSettings.brightness ?? 0.5}
                      onChange={(e) => updateMcSetting("brightness", Number(e.target.value))}
                      className="w-28 accent-[#e8956a]"
                    />
                    <span className="text-xs text-white w-10 text-right">{Math.round((mcSettings.brightness ?? 0.5) * 100)}%</span>
                  </div>
                </div>
                {/* Keybinds button */}
                <button
                  onClick={() => setShowKeybinds(true)}
                  className="w-full py-2.5 bg-[#2d2250] hover:bg-[#352960] border-2 border-[rgba(184,169,232,0.10)] rounded text-xs font-medium cursor-pointer text-white"
                 
                >
                  ⌨ Configure Keybinds
                </button>
              </div>
            )}
          </div>

          {/* Behavior */}
          <div className="bg-[#231a42] rounded p-5 border-2 border-[rgba(184,169,232,0.10)]" >
            <h2 className="font-bold text-sm mb-4 flex items-center gap-2" style={{color: '#f0c35e'}}>
              🔧 Behavior
            </h2>
            <div className="space-y-3">
              <label className="flex items-center justify-between cursor-pointer">
                <div>
                  <p className="text-sm font-medium">Auto-update games</p>
                  <p className="text-xs text-[#8b82a8]">Download updates when you click Play</p>
                </div>
                <div className="relative">
                  <input type="checkbox" defaultChecked className="sr-only peer" />
                  <div className="w-10 h-5 bg-[#2d2250] rounded peer-checked:bg-[#e8956a] transition-colors" />
                  <div className="absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded peer-checked:translate-x-5 transition-transform" />
                </div>
              </label>
              <label className="flex items-center justify-between cursor-pointer">
                <div>
                  <p className="text-sm font-medium">Close launcher on play</p>
                  <p className="text-xs text-[#8b82a8]">Minimize McBlox when Minecraft opens</p>
                </div>
                <div className="relative">
                  <input type="checkbox" className="sr-only peer" />
                  <div className="w-10 h-5 bg-[#2d2250] rounded peer-checked:bg-[#e8956a] transition-colors" />
                  <div className="absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded peer-checked:translate-x-5 transition-transform" />
                </div>
              </label>
            </div>
          </div>

          {/* Storage */}
          <div className="bg-[#231a42] rounded p-5 border-2 border-[rgba(184,169,232,0.10)]" >
            <h2 className="font-bold text-sm mb-3 flex items-center gap-2" style={{color: '#f0c35e'}}>
              📁 Storage
            </h2>
            {storageInfo && (
              <div className="space-y-2 mb-4">
                <div className="flex justify-between text-xs">
                  <span className="text-[#c4bdd6]">Game instances</span>
                  <span className="text-white font-medium">{formatBytes(storageInfo.instances)}</span>
                </div>
                <div className="flex justify-between text-xs">
                  <span className="text-[#c4bdd6]">Libraries</span>
                  <span className="text-white font-medium">{formatBytes(storageInfo.libraries)}</span>
                </div>
                <div className="flex justify-between text-xs">
                  <span className="text-[#c4bdd6]">Assets</span>
                  <span className="text-white font-medium">{formatBytes(storageInfo.assets)}</span>
                </div>
                <div className="flex justify-between text-xs">
                  <span className="text-[#c4bdd6]">Java runtime</span>
                  <span className="text-white font-medium">{formatBytes(storageInfo.java)}</span>
                </div>
                <div className="flex justify-between text-xs border-t border-[rgba(184,169,232,0.10)] pt-2 mt-2">
                  <span className="text-[#c4bdd6] font-bold">Total</span>
                  <span className="text-white font-bold">{formatBytes(storageInfo.total)}</span>
                </div>
              </div>
            )}
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-[#c4bdd6]">{storageInfo?.path || "Loading..."}</p>
                <p className="text-xs text-[#8b82a8] mt-0.5">Game data location</p>
              </div>
            </div>
            <div className="flex gap-2 mt-4">
              <button
                onClick={clearCache}
                disabled={clearing}
                className="px-4 py-2 bg-[rgba(232,93,93,0.08)] hover:bg-[rgba(232,93,93,0.12)] border-2 border-[rgba(232,93,93,0.3)] rounded text-xs font-medium cursor-pointer text-[#e85d5d] disabled:opacity-50"
              >
                {clearing ? "Clearing..." : "🗑 Clear Game Cache"}
              </button>
            </div>
          </div>

          {/* About */}
          <div className="bg-[#231a42] rounded p-5 border-2 border-[rgba(184,169,232,0.10)]" >
            <h2 className="font-bold text-sm mb-3 flex items-center gap-2" style={{color: '#f0c35e'}}>
              ℹ️ About
            </h2>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium">McBlox v{__APP_VERSION__}</p>
                <p className="text-xs text-[#8b82a8] mt-0.5">Minecraft game launcher</p>
              </div>
              <div className="flex items-center gap-3">
                {updateResult && (
                  <span className="text-xs text-[#c4bdd6]">{updateResult}</span>
                )}
                <button
                  onClick={checkForUpdates}
                  disabled={checkingUpdate}
                  className="px-4 py-2 bg-[#e8956a] hover:bg-[#f0a87e] border-2 border-[rgba(0,0,0,0.2)] rounded text-xs font-medium cursor-pointer text-black disabled:opacity-50"
                 
                >
                  {checkingUpdate ? "Checking..." : "🔄 Check for Updates"}
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Keybinds Modal */}
      {showKeybinds && (
        <KeybindsModal
          keybinds={mcSettings.keybinds || {}}
          onSave={(kb) => { updateMcSetting("keybinds", Object.keys(kb).length > 0 ? kb : null); setShowKeybinds(false); }}
          onClose={() => setShowKeybinds(false)}
          listeningKey={listeningKey}
          setListeningKey={setListeningKey}
        />
      )}

      {/* Auth Modal */}
      {showAuthModal && (
        <div
          className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center"
          onClick={(e) => { if (e.target === e.currentTarget) setShowAuthModal(false); }}
        >
          <div className="bg-[#1a1232] border-2 border-[#e8956a] rounded w-[380px] p-7" style={{boxShadow: '0 0 30px rgba(232,149,106,0.15)'}}>
            <h2 className="text-center text-lg font-bold mb-4" style={{color: '#f0c35e'}}>
              {isSignUp ? "Sign Up" : "Sign In"}
            </h2>
            <form onSubmit={handleMcbloxAuth} className="space-y-3">
              {isSignUp && (
                <input
                  type="text"
                  value={authUsername}
                  onChange={(e) => setAuthUsername(e.target.value)}
                  placeholder="Username"
                  className="w-full px-3 py-2 bg-[#231a42] border-2 border-[rgba(184,169,232,0.10)] rounded text-sm text-white outline-none focus:border-[#e8956a]"
                />
              )}
              <input
                type="email"
                value={authEmail}
                onChange={(e) => setAuthEmail(e.target.value)}
                placeholder="Email"
                required
                className="w-full px-3 py-2 bg-[#231a42] border-2 border-[rgba(184,169,232,0.10)] rounded text-sm text-white outline-none focus:border-[#e8956a]"
              />
              <input
                type="password"
                value={authPassword}
                onChange={(e) => setAuthPassword(e.target.value)}
                placeholder="Password"
                required
                minLength={6}
                className="w-full px-3 py-2 bg-[#231a42] border-2 border-[rgba(184,169,232,0.10)] rounded text-sm text-white outline-none focus:border-[#e8956a]"
              />
              {authModalError && (
                <p className="text-[#e85d5d] text-xs">{authModalError}</p>
              )}
              <button
                type="submit"
                disabled={authLoading}
                className="w-full py-2.5 bg-[#e8956a] hover:bg-[#f0a87e] border-2 border-[rgba(0,0,0,0.1)] rounded text-black font-bold text-sm cursor-pointer disabled:opacity-50"
               
              >
                {authLoading ? "Loading..." : isSignUp ? "Sign Up" : "Sign In"}
              </button>
            </form>
            <p className="text-center text-xs text-[#8b82a8] mt-3">
              {isSignUp ? "Already have an account?" : "Don't have an account?"}
              <button
                onClick={() => { setIsSignUp(!isSignUp); setAuthModalError(""); }}
                className="text-[#b8a9e8] font-semibold ml-1 cursor-pointer bg-transparent border-none"
              >
                {isSignUp ? "Sign In" : "Sign Up"}
              </button>
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

// MC key name mapping for display
const MC_KEYBINDS: { key: string; label: string; category: string }[] = [
  // Movement
  { key: "key_key.forward", label: "Walk Forward", category: "Movement" },
  { key: "key_key.back", label: "Walk Backward", category: "Movement" },
  { key: "key_key.left", label: "Strafe Left", category: "Movement" },
  { key: "key_key.right", label: "Strafe Right", category: "Movement" },
  { key: "key_key.jump", label: "Jump", category: "Movement" },
  { key: "key_key.sneak", label: "Sneak", category: "Movement" },
  { key: "key_key.sprint", label: "Sprint", category: "Movement" },
  // Gameplay
  { key: "key_key.attack", label: "Attack/Destroy", category: "Gameplay" },
  { key: "key_key.use", label: "Use Item/Place Block", category: "Gameplay" },
  { key: "key_key.pickItem", label: "Pick Block", category: "Gameplay" },
  { key: "key_key.drop", label: "Drop Item", category: "Gameplay" },
  { key: "key_key.swapOffhand", label: "Swap Offhand", category: "Gameplay" },
  // Inventory
  { key: "key_key.inventory", label: "Open Inventory", category: "Inventory" },
  { key: "key_key.hotbar.1", label: "Hotbar 1", category: "Inventory" },
  { key: "key_key.hotbar.2", label: "Hotbar 2", category: "Inventory" },
  { key: "key_key.hotbar.3", label: "Hotbar 3", category: "Inventory" },
  { key: "key_key.hotbar.4", label: "Hotbar 4", category: "Inventory" },
  { key: "key_key.hotbar.5", label: "Hotbar 5", category: "Inventory" },
  { key: "key_key.hotbar.6", label: "Hotbar 6", category: "Inventory" },
  { key: "key_key.hotbar.7", label: "Hotbar 7", category: "Inventory" },
  { key: "key_key.hotbar.8", label: "Hotbar 8", category: "Inventory" },
  { key: "key_key.hotbar.9", label: "Hotbar 9", category: "Inventory" },
  // Misc
  { key: "key_key.chat", label: "Open Chat", category: "Misc" },
  { key: "key_key.command", label: "Open Command", category: "Misc" },
  { key: "key_key.playerlist", label: "Player List", category: "Misc" },
  { key: "key_key.screenshot", label: "Screenshot", category: "Misc" },
  { key: "key_key.togglePerspective", label: "Toggle Perspective", category: "Misc" },
  { key: "key_key.fullscreen", label: "Toggle Fullscreen", category: "Misc" },
];

// Maps browser KeyboardEvent.code to Minecraft's LWJGL key name
function browserKeyToMcKey(e: KeyboardEvent): string {
  const map: Record<string, string> = {
    KeyA: "key.keyboard.a", KeyB: "key.keyboard.b", KeyC: "key.keyboard.c", KeyD: "key.keyboard.d",
    KeyE: "key.keyboard.e", KeyF: "key.keyboard.f", KeyG: "key.keyboard.g", KeyH: "key.keyboard.h",
    KeyI: "key.keyboard.i", KeyJ: "key.keyboard.j", KeyK: "key.keyboard.k", KeyL: "key.keyboard.l",
    KeyM: "key.keyboard.m", KeyN: "key.keyboard.n", KeyO: "key.keyboard.o", KeyP: "key.keyboard.p",
    KeyQ: "key.keyboard.q", KeyR: "key.keyboard.r", KeyS: "key.keyboard.s", KeyT: "key.keyboard.t",
    KeyU: "key.keyboard.u", KeyV: "key.keyboard.v", KeyW: "key.keyboard.w", KeyX: "key.keyboard.x",
    KeyY: "key.keyboard.y", KeyZ: "key.keyboard.z",
    Digit0: "key.keyboard.0", Digit1: "key.keyboard.1", Digit2: "key.keyboard.2", Digit3: "key.keyboard.3",
    Digit4: "key.keyboard.4", Digit5: "key.keyboard.5", Digit6: "key.keyboard.6", Digit7: "key.keyboard.7",
    Digit8: "key.keyboard.8", Digit9: "key.keyboard.9",
    Space: "key.keyboard.space", ShiftLeft: "key.keyboard.left.shift", ShiftRight: "key.keyboard.right.shift",
    ControlLeft: "key.keyboard.left.control", ControlRight: "key.keyboard.right.control",
    AltLeft: "key.keyboard.left.alt", AltRight: "key.keyboard.right.alt",
    Tab: "key.keyboard.tab", Enter: "key.keyboard.enter", Escape: "key.keyboard.escape",
    Backspace: "key.keyboard.backspace", Delete: "key.keyboard.delete",
    ArrowUp: "key.keyboard.up", ArrowDown: "key.keyboard.down", ArrowLeft: "key.keyboard.left", ArrowRight: "key.keyboard.right",
    F1: "key.keyboard.f1", F2: "key.keyboard.f2", F3: "key.keyboard.f3", F4: "key.keyboard.f4",
    F5: "key.keyboard.f5", F6: "key.keyboard.f6", F7: "key.keyboard.f7", F8: "key.keyboard.f8",
    F9: "key.keyboard.f9", F10: "key.keyboard.f10", F11: "key.keyboard.f11", F12: "key.keyboard.f12",
    Minus: "key.keyboard.minus", Equal: "key.keyboard.equal",
    BracketLeft: "key.keyboard.left.bracket", BracketRight: "key.keyboard.right.bracket",
    Semicolon: "key.keyboard.semicolon", Quote: "key.keyboard.apostrophe",
    Comma: "key.keyboard.comma", Period: "key.keyboard.period", Slash: "key.keyboard.slash",
    Backslash: "key.keyboard.backslash", Backquote: "key.keyboard.grave.accent",
  };
  return map[e.code] || `key.keyboard.${e.key.toLowerCase()}`;
}

function mcKeyDisplayName(mcKey: string): string {
  if (!mcKey || mcKey === "key.keyboard.unknown") return "—";
  const short = mcKey.replace("key.keyboard.", "").replace("key.mouse.", "Mouse ");
  return short.split(".").map(p => p.charAt(0).toUpperCase() + p.slice(1)).join(" ");
}

import { useEffect as useEff } from "react";

function KeybindsModal({ keybinds, onSave, onClose, listeningKey, setListeningKey }: {
  keybinds: Record<string, string>;
  onSave: (kb: Record<string, string>) => void;
  onClose: () => void;
  listeningKey: string | null;
  setListeningKey: (k: string | null) => void;
}) {
  const [local, setLocal] = useState<Record<string, string>>({ ...keybinds });

  useEff(() => {
    if (!listeningKey) return;
    const handler = (e: KeyboardEvent) => {
      e.preventDefault();
      e.stopPropagation();
      const mc = browserKeyToMcKey(e);
      setLocal(prev => ({ ...prev, [listeningKey]: mc }));
      setListeningKey(null);
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [listeningKey]);

  const categories = [...new Set(MC_KEYBINDS.map(k => k.category))];

  return (
    <div
      className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center"
      onClick={(e) => { if (e.target === e.currentTarget) { setListeningKey(null); onClose(); } }}
    >
      <div className="bg-[#1a1232] border-2 border-[#e8956a] rounded w-[520px] max-h-[80vh] flex flex-col" style={{boxShadow: '0 0 30px rgba(232,149,106,0.15)'}}>
        <div className="flex items-center justify-between px-5 py-3 border-b border-[rgba(184,169,232,0.10)]">
          <h2 className="text-sm font-bold" style={{color: '#f0c35e'}}>
            ⌨ Keybinds
          </h2>
          <div className="flex gap-2">
            <button
              onClick={() => { setLocal({}); }}
              className="px-3 py-1 bg-[#2d2250] hover:bg-[#352960] border border-[rgba(184,169,232,0.10)] rounded text-[10px] text-[#c4bdd6] cursor-pointer"
             
            >
              Reset All
            </button>
            <button
              onClick={() => onSave(local)}
              className="px-3 py-1 bg-[#e8956a] hover:bg-[#f0a87e] rounded text-[10px] text-black font-bold cursor-pointer"
             
            >
              Save
            </button>
          </div>
        </div>
        <div className="overflow-y-auto flex-1 px-5 py-3 space-y-4">
          {categories.map(cat => (
            <div key={cat}>
              <h3 className="text-xs font-bold text-[#8b82a8] uppercase mb-2">{cat}</h3>
              <div className="space-y-1">
                {MC_KEYBINDS.filter(k => k.category === cat).map(kb => {
                  const current = local[kb.key];
                  const isListening = listeningKey === kb.key;
                  return (
                    <div key={kb.key} className="flex items-center justify-between py-1.5 px-2 rounded hover:bg-[#231a42]">
                      <span className="text-xs text-white">{kb.label}</span>
                      <div className="flex items-center gap-1.5">
                        <button
                          onClick={() => setListeningKey(isListening ? null : kb.key)}
                          className={`px-3 py-1 rounded text-[10px] font-medium cursor-pointer border ${
                            isListening
                              ? "bg-[#ff9800] border-[#ff9800] text-black animate-pulse"
                              : current
                                ? "bg-[#2d2250] border-[rgba(184,169,232,0.10)] text-[#e8956a]"
                                : "bg-[#2d2250] border-[rgba(184,169,232,0.10)] text-[#8b82a8]"
                          }`}
                          style={{minWidth: '80px'}}
                        >
                          {isListening ? "Press a key..." : current ? mcKeyDisplayName(current) : "Not set"}
                        </button>
                        {current && (
                          <button
                            onClick={() => setLocal(prev => { const n = { ...prev }; delete n[kb.key]; return n; })}
                            className="px-1.5 py-1 text-[10px] text-[#e85d5d] hover:text-[#ff8888] cursor-pointer bg-transparent border-none"
                            title="Let game decide"
                          >
                            ✕
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
        <div className="px-5 py-2 border-t border-[rgba(184,169,232,0.10)] text-[10px] text-[#8b82a8]">
          Click a keybind button then press a key to set it. ✕ = let game decide.
        </div>
      </div>
    </div>
  );
}
