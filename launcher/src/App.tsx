import { useState, useEffect } from "react";
import { check } from "@tauri-apps/plugin-updater";
import { relaunch } from "@tauri-apps/plugin-process";
import Sidebar from "./components/Sidebar";
import { ToastProvider } from "./components/Toast";
import Home from "./pages/Home";
import Settings from "./pages/Settings";

type Page = "home" | "settings";

function App() {
  const [page, setPage] = useState<Page>("home");
  const [updateAvailable, setUpdateAvailable] = useState<{version: string} | null>(null);
  const [updating, setUpdating] = useState(false);
  const [updateProgress, setUpdateProgress] = useState("");

  useEffect(() => {
    checkForUpdates();
  }, []);

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
        <div className="flex items-center justify-center gap-3 px-4 py-2 bg-[#5b8731] text-white text-sm shrink-0">
          {updating ? (
            <span>{updateProgress}</span>
          ) : (
            <>
              <span>McBlox v{updateAvailable.version} is available!</span>
              <button
                onClick={installUpdate}
                className="px-3 py-1 bg-white/20 rounded hover:bg-white/30 font-semibold cursor-pointer border-none text-white"
              >
                Install Update
              </button>
              <button
                onClick={() => setUpdateAvailable(null)}
                className="ml-2 opacity-70 hover:opacity-100 cursor-pointer bg-transparent border-none text-white"
              >✕</button>
            </>
          )}
        </div>
      )}
      <div className="flex flex-1 min-h-0">
        <Sidebar current={page} onNavigate={setPage} />
        <main className="flex-1 overflow-y-auto">
          {page === "home" && <Home />}
          {page === "settings" && <Settings />}
        </main>
      </div>
    </div>
    </ToastProvider>
  );
}

export default App;
