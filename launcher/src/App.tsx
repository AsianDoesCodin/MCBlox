import { useState, useEffect } from "react";
import Sidebar from "./components/Sidebar";
import Home from "./pages/Home";
import Settings from "./pages/Settings";

const CURRENT_VERSION = "0.2.2";
const GITHUB_RELEASES_URL = "https://api.github.com/repos/AsianDoesCodin/MCBlox/releases/latest";

type Page = "home" | "settings";

function App() {
  const [page, setPage] = useState<Page>("home");
  const [updateAvailable, setUpdateAvailable] = useState<{version: string; url: string} | null>(null);

  useEffect(() => {
    checkForUpdates();
  }, []);

  async function checkForUpdates() {
    try {
      const resp = await fetch(GITHUB_RELEASES_URL);
      if (!resp.ok) return;
      const release = await resp.json();
      const latest = (release.tag_name || "").replace(/^v/, "");
      if (latest && latest !== CURRENT_VERSION && compareVersions(latest, CURRENT_VERSION) > 0) {
        const asset = release.assets?.find((a: any) => a.name?.includes("x64-setup.exe"));
        setUpdateAvailable({
          version: latest,
          url: asset?.browser_download_url || release.html_url,
        });
      }
    } catch {
      // Silently fail — don't block the app
    }
  }

  function compareVersions(a: string, b: string): number {
    const pa = a.split(".").map(Number);
    const pb = b.split(".").map(Number);
    for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
      const na = pa[i] || 0, nb = pb[i] || 0;
      if (na > nb) return 1;
      if (na < nb) return -1;
    }
    return 0;
  }

  return (
    <div className="flex h-screen flex-col">
      {updateAvailable && (
        <div className="flex items-center justify-center gap-3 px-4 py-2 bg-[#5b8731] text-white text-sm shrink-0">
          <span>McBlox v{updateAvailable.version} is available!</span>
          <a
            href={updateAvailable.url}
            target="_blank"
            rel="noreferrer"
            className="px-3 py-1 bg-white/20 rounded hover:bg-white/30 font-semibold cursor-pointer"
          >
            Download Update
          </a>
          <button
            onClick={() => setUpdateAvailable(null)}
            className="ml-2 opacity-70 hover:opacity-100 cursor-pointer bg-transparent border-none text-white"
          >✕</button>
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
  );
}

export default App;
