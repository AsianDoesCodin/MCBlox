import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";

interface McAccount {
  username: string;
  uuid: string;
  access_token: string;
}

export default function Settings() {
  const [mcAccount, setMcAccount] = useState<McAccount | null>(null);
  const [authState, setAuthState] = useState<"idle" | "waiting" | "polling">("idle");
  const [deviceCode, setDeviceCode] = useState<{user_code: string; verification_uri: string} | null>(null);

  useEffect(() => {
    invoke("mc_auth_get_account").then((acc: any) => {
      if (acc) setMcAccount(acc);
    }).catch(() => {});
  }, []);

  async function startMcAuth() {
    try {
      setAuthState("waiting");
      const code: any = await invoke("mc_auth_start_device_flow");
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
    } catch (e: any) {
      alert(`Auth failed: ${e}`);
      setAuthState("idle");
      setDeviceCode(null);
    }
  }

  async function logoutMc() {
    await invoke("mc_auth_logout");
    setMcAccount(null);
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
                      at <span className="text-[#5b8731]">{deviceCode.verification_uri}</span>
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

          {/* McBlox Account */}
          <div className="bg-[#3a3a3a] rounded p-5 border-2 border-[#555]" style={{borderBottom: '4px solid rgba(0,0,0,0.3)'}}>
            <div className="flex items-center gap-4">
              <div className="w-11 h-11 rounded bg-[#5b8731] flex items-center justify-center text-white font-black text-lg shrink-0" style={{fontFamily: "'Silkscreen', monospace"}}>
                M
              </div>
              <div className="flex-1">
                <h2 className="font-bold text-sm">McBlox Account</h2>
                <p className="text-xs text-[#808080] mt-0.5">Rate games, add friends, and publish</p>
              </div>
              <button className="px-5 py-2 bg-[#5b8731] hover:bg-[#6b9b3a] rounded text-white text-sm font-semibold cursor-pointer border-b-[3px] border-[rgba(0,0,0,0.3)]" style={{fontFamily: "'Silkscreen', monospace"}}>
                Sign In
              </button>
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
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-[#b0b0b0]">~/.mcblox/instances/</p>
                <p className="text-xs text-[#808080] mt-0.5">Game data location</p>
              </div>
              <button className="px-4 py-1.5 bg-[#484848] hover:bg-[#525252] border-2 border-[#555] rounded text-xs cursor-pointer">
                Change
              </button>
            </div>
          </div>

          {/* Version */}
          <p className="text-center text-xs text-[#808080] pb-4" style={{fontFamily: "'Silkscreen', monospace"}}>
            McBlox v0.1.0
          </p>
        </div>
      </div>
    </div>
  );
}
