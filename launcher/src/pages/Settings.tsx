import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { check } from "@tauri-apps/plugin-updater";
import { relaunch } from "@tauri-apps/plugin-process";
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

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

export default function Settings() {
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
  }, []);

  async function loadStorageInfo() {
    try {
      const info: any = await invoke("get_storage_info");
      setStorageInfo(info);
    } catch {}
  }

  async function clearCache() {
    if (!confirm("This will delete all downloaded game instances. You'll need to re-download them when you play. Continue?")) return;
    setClearing(true);
    try {
      const result = await invoke("clear_all_instances");
      alert(result);
      loadStorageInfo();
    } catch (e) {
      alert(`Failed: ${e}`);
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
      <div className="flex items-center gap-3 px-6 py-3 bg-[#1a1a1a] border-b-[3px] border-[#5b8731] shrink-0">
        <h1 className="text-base font-bold" style={{fontFamily: "'Silkscreen', monospace", color: '#ffaa00'}}>Settings</h1>
      </div>

      <div className="flex-1 overflow-y-auto p-6 max-w-2xl">
        <div className="space-y-5">
          {/* Minecraft Account */}
          <div className="bg-[#3a3a3a] rounded p-5 border-2 border-[#555]" style={{borderBottom: '4px solid rgba(0,0,0,0.3)'}}>
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
                    <p className="text-xs text-[#55ff55] mt-0.5">Signed in</p>
                  </div>
                  <button
                    onClick={logoutMc}
                    className="px-5 py-2 bg-[#5a1e1e] hover:bg-[#6a2222] border-2 border-[#7a2e2e] rounded text-sm font-medium cursor-pointer text-[#ff5555]"
                  >
                    Sign Out
                  </button>
                </>
              ) : authState === "polling" && deviceCode ? (
                <>
                  <div className="w-11 h-11 rounded bg-[#484848] flex items-center justify-center text-xl shrink-0 animate-pulse">
                    ⛏
                  </div>
                  <div className="flex-1">
                    <h2 className="font-bold text-sm">Enter this code:</h2>
                    <p className="text-lg font-mono font-bold text-[#55ff55] mt-1 tracking-widest" style={{fontFamily: "'Silkscreen', monospace"}}>
                      {deviceCode.user_code}
                    </p>
                    <p className="text-xs text-[#808080] mt-1">
                      at <a
                        href={deviceCode.verification_uri}
                        target="_blank"
                        rel="noreferrer"
                        className="text-[#5b8731] underline hover:text-[#7bc040] cursor-pointer"
                      >{deviceCode.verification_uri}</a>
                    </p>
                  </div>
                  <div className="text-xs text-[#808080] animate-pulse">Waiting...</div>
                </>
              ) : (
                <>
                  <div className="w-11 h-11 rounded bg-[#484848] flex items-center justify-center text-xl shrink-0">
                    ⛏
                  </div>
                  <div className="flex-1">
                    <h2 className="font-bold text-sm">Minecraft Account</h2>
                    <p className="text-xs text-[#808080] mt-0.5">Sign in with Microsoft to play online</p>
                  </div>
                  <button
                    onClick={startMcAuth}
                    disabled={authState !== "idle"}
                    className="px-5 py-2 bg-[#484848] hover:bg-[#525252] border-2 border-[#555] rounded text-sm font-medium cursor-pointer border-b-[3px] border-b-[rgba(0,0,0,0.3)]"
                  >
                    Sign in with Microsoft
                  </button>
                </>
              )}
            </div>
          </div>

          {/* MC Auth Error */}
          {authError && (
            <div className="bg-[#5a1e1e] border-2 border-[#7a2e2e] rounded p-3 text-sm text-[#ff5555]">
              MC Auth Error: {authError}
            </div>
          )}

          {/* McBlox Account */}
          <div className="bg-[#3a3a3a] rounded p-5 border-2 border-[#555]" style={{borderBottom: '4px solid rgba(0,0,0,0.3)'}}>
            <div className="flex items-center gap-4">
              <img src="/mcbloxlogo.png" alt="McBlox" className="w-11 h-11 rounded shrink-0" />
              {mcbloxUser ? (
                <>
                  <div className="flex-1">
                    <h2 className="font-bold text-sm">{mcbloxUser.user_metadata?.username || mcbloxUser.email?.split("@")[0]}</h2>
                    <p className="text-xs text-[#55ff55] mt-0.5">Signed in</p>
                  </div>
                  <button
                    onClick={mcbloxSignOut}
                    className="px-5 py-2 bg-[#5a1e1e] hover:bg-[#6a2222] border-2 border-[#7a2e2e] rounded text-sm font-medium cursor-pointer text-[#ff5555]"
                  >
                    Sign Out
                  </button>
                </>
              ) : (
                <>
                  <div className="flex-1">
                    <h2 className="font-bold text-sm">McBlox Account</h2>
                    <p className="text-xs text-[#808080] mt-0.5">Rate games and publish</p>
                  </div>
                  <button
                    onClick={() => setShowAuthModal(true)}
                    className="px-5 py-2 bg-[#5b8731] hover:bg-[#6b9b3a] rounded text-white text-sm font-semibold cursor-pointer border-b-[3px] border-[rgba(0,0,0,0.3)]"
                    style={{fontFamily: "'Silkscreen', monospace"}}
                  >
                    Sign In
                  </button>
                </>
              )}
            </div>
          </div>

          {/* Performance */}
          <div className="bg-[#3a3a3a] rounded p-5 border-2 border-[#555]" style={{borderBottom: '4px solid rgba(0,0,0,0.3)'}}>
            <h2 className="font-bold text-sm mb-4 flex items-center gap-2" style={{fontFamily: "'Silkscreen', monospace", color: '#ffaa00'}}>
              ⚡ Performance
            </h2>
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium">Java Memory</p>
                  <p className="text-xs text-[#808080]">Allocate RAM for Minecraft</p>
                </div>
                <div className="flex items-center gap-2">
                  <select className="px-3 py-1.5 bg-[#2b2b2b] border-2 border-[#555] rounded text-xs text-white outline-none cursor-pointer">
                    <option>2 GB</option>
                    <option>4 GB</option>
                  </select>
                  <span className="text-[#808080] text-xs">to</span>
                  <select className="px-3 py-1.5 bg-[#2b2b2b] border-2 border-[#555] rounded text-xs text-white outline-none cursor-pointer">
                    <option>4 GB</option>
                    <option>6 GB</option>
                    <option>8 GB</option>
                    <option>12 GB</option>
                    <option>16 GB</option>
                  </select>
                </div>
              </div>
            </div>
          </div>

          {/* Behavior */}
          <div className="bg-[#3a3a3a] rounded p-5 border-2 border-[#555]" style={{borderBottom: '4px solid rgba(0,0,0,0.3)'}}>
            <h2 className="font-bold text-sm mb-4 flex items-center gap-2" style={{fontFamily: "'Silkscreen', monospace", color: '#ffaa00'}}>
              🔧 Behavior
            </h2>
            <div className="space-y-3">
              <label className="flex items-center justify-between cursor-pointer">
                <div>
                  <p className="text-sm font-medium">Auto-update games</p>
                  <p className="text-xs text-[#808080]">Download updates when you click Play</p>
                </div>
                <div className="relative">
                  <input type="checkbox" defaultChecked className="sr-only peer" />
                  <div className="w-10 h-5 bg-[#484848] rounded peer-checked:bg-[#5b8731] transition-colors" />
                  <div className="absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded peer-checked:translate-x-5 transition-transform" />
                </div>
              </label>
              <label className="flex items-center justify-between cursor-pointer">
                <div>
                  <p className="text-sm font-medium">Close launcher on play</p>
                  <p className="text-xs text-[#808080]">Minimize McBlox when Minecraft opens</p>
                </div>
                <div className="relative">
                  <input type="checkbox" className="sr-only peer" />
                  <div className="w-10 h-5 bg-[#484848] rounded peer-checked:bg-[#5b8731] transition-colors" />
                  <div className="absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded peer-checked:translate-x-5 transition-transform" />
                </div>
              </label>
            </div>
          </div>

          {/* Storage */}
          <div className="bg-[#3a3a3a] rounded p-5 border-2 border-[#555]" style={{borderBottom: '4px solid rgba(0,0,0,0.3)'}}>
            <h2 className="font-bold text-sm mb-3 flex items-center gap-2" style={{fontFamily: "'Silkscreen', monospace", color: '#ffaa00'}}>
              📁 Storage
            </h2>
            {storageInfo && (
              <div className="space-y-2 mb-4">
                <div className="flex justify-between text-xs">
                  <span className="text-[#b0b0b0]">Game instances</span>
                  <span className="text-white font-medium">{formatBytes(storageInfo.instances)}</span>
                </div>
                <div className="flex justify-between text-xs">
                  <span className="text-[#b0b0b0]">Libraries</span>
                  <span className="text-white font-medium">{formatBytes(storageInfo.libraries)}</span>
                </div>
                <div className="flex justify-between text-xs">
                  <span className="text-[#b0b0b0]">Assets</span>
                  <span className="text-white font-medium">{formatBytes(storageInfo.assets)}</span>
                </div>
                <div className="flex justify-between text-xs">
                  <span className="text-[#b0b0b0]">Java runtime</span>
                  <span className="text-white font-medium">{formatBytes(storageInfo.java)}</span>
                </div>
                <div className="flex justify-between text-xs border-t border-[#555] pt-2 mt-2">
                  <span className="text-[#b0b0b0] font-bold">Total</span>
                  <span className="text-white font-bold">{formatBytes(storageInfo.total)}</span>
                </div>
              </div>
            )}
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-[#b0b0b0]">{storageInfo?.path || "Loading..."}</p>
                <p className="text-xs text-[#808080] mt-0.5">Game data location</p>
              </div>
            </div>
            <div className="flex gap-2 mt-4">
              <button
                onClick={clearCache}
                disabled={clearing}
                className="px-4 py-2 bg-[#5a1e1e] hover:bg-[#6a2222] border-2 border-[#7a2e2e] rounded text-xs font-medium cursor-pointer text-[#ff5555] disabled:opacity-50"
              >
                {clearing ? "Clearing..." : "🗑 Clear Game Cache"}
              </button>
            </div>
          </div>

          {/* About */}
          <div className="bg-[#3a3a3a] rounded p-5 border-2 border-[#555]" style={{borderBottom: '4px solid rgba(0,0,0,0.3)'}}>
            <h2 className="font-bold text-sm mb-3 flex items-center gap-2" style={{fontFamily: "'Silkscreen', monospace", color: '#ffaa00'}}>
              ℹ️ About
            </h2>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium" style={{fontFamily: "'Silkscreen', monospace"}}>McBlox v0.2.4</p>
                <p className="text-xs text-[#808080] mt-0.5">Minecraft game launcher</p>
              </div>
              <div className="flex items-center gap-3">
                {updateResult && (
                  <span className="text-xs text-[#b0b0b0]">{updateResult}</span>
                )}
                <button
                  onClick={checkForUpdates}
                  disabled={checkingUpdate}
                  className="px-4 py-2 bg-[#5b8731] hover:bg-[#6b9b3a] border-2 border-[#4a7028] rounded text-xs font-medium cursor-pointer text-white disabled:opacity-50"
                  style={{fontFamily: "'Silkscreen', monospace"}}
                >
                  {checkingUpdate ? "Checking..." : "🔄 Check for Updates"}
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Auth Modal */}
      {showAuthModal && (
        <div
          className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center"
          onClick={(e) => { if (e.target === e.currentTarget) setShowAuthModal(false); }}
        >
          <div className="bg-[#2b2b2b] border-2 border-[#5b8731] rounded w-[380px] p-7" style={{borderBottom: '4px solid rgba(0,0,0,0.3)'}}>
            <h2 className="text-center text-lg font-bold mb-4" style={{fontFamily: "'Silkscreen', monospace", color: '#ffaa00'}}>
              {isSignUp ? "Sign Up" : "Sign In"}
            </h2>
            <form onSubmit={handleMcbloxAuth} className="space-y-3">
              {isSignUp && (
                <input
                  type="text"
                  value={authUsername}
                  onChange={(e) => setAuthUsername(e.target.value)}
                  placeholder="Username"
                  className="w-full px-3 py-2 bg-[#3a3a3a] border-2 border-[#555] rounded text-sm text-white outline-none focus:border-[#5b8731]"
                />
              )}
              <input
                type="email"
                value={authEmail}
                onChange={(e) => setAuthEmail(e.target.value)}
                placeholder="Email"
                required
                className="w-full px-3 py-2 bg-[#3a3a3a] border-2 border-[#555] rounded text-sm text-white outline-none focus:border-[#5b8731]"
              />
              <input
                type="password"
                value={authPassword}
                onChange={(e) => setAuthPassword(e.target.value)}
                placeholder="Password"
                required
                minLength={6}
                className="w-full px-3 py-2 bg-[#3a3a3a] border-2 border-[#555] rounded text-sm text-white outline-none focus:border-[#5b8731]"
              />
              {authModalError && (
                <p className="text-[#ff5555] text-xs">{authModalError}</p>
              )}
              <button
                type="submit"
                disabled={authLoading}
                className="w-full py-2.5 bg-[#5b8731] hover:bg-[#6b9b3a] border-2 border-[rgba(255,255,255,0.1)] rounded text-white font-bold text-sm cursor-pointer disabled:opacity-50"
                style={{fontFamily: "'Silkscreen', monospace", borderBottom: '4px solid rgba(0,0,0,0.3)'}}
              >
                {authLoading ? "Loading..." : isSignUp ? "Sign Up" : "Sign In"}
              </button>
            </form>
            <p className="text-center text-xs text-[#808080] mt-3">
              {isSignUp ? "Already have an account?" : "Don't have an account?"}
              <button
                onClick={() => { setIsSignUp(!isSignUp); setAuthModalError(""); }}
                className="text-[#5b8731] font-semibold ml-1 cursor-pointer bg-transparent border-none"
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
