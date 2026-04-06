import { useState } from "react";
import Sidebar from "./components/Sidebar";
import Home from "./pages/Home";
import Friends from "./pages/Friends";
import Settings from "./pages/Settings";

type Page = "home" | "friends" | "settings";

function App() {
  const [page, setPage] = useState<Page>("home");

  return (
    <div className="flex h-screen">
      <Sidebar current={page} onNavigate={setPage} />
      <main className="flex-1 overflow-y-auto">
        {page === "home" && <Home />}
        {page === "friends" && <Friends />}
        {page === "settings" && <Settings />}
      </main>
    </div>
  );
}

export default App;
