type Page = "home" | "settings";

interface Props {
  current: Page;
  onNavigate: (page: Page) => void;
  mcUsername?: string | null;
}

const nav: { page: Page; label: string; icon: string }[] = [
  { page: "home", label: "Discover", icon: "⛏" },
  { page: "settings", label: "Settings", icon: "⚙" },
];

export default function Sidebar({ current, onNavigate, mcUsername }: Props) {
  return (
    <div className="w-[200px] min-w-[200px] bg-[#060a14] flex flex-col border-r-[3px] border-[#00e676]" style={{boxShadow: '3px 0 15px rgba(0, 230, 118, 0.15)'}}>
      {/* Logo */}
      <div className="px-5 py-5 flex items-center gap-2.5">
        <img src="/mcbloxlogo.png" alt="McBlox" className="h-10 w-auto" />
      </div>

      {/* Nav */}
      <nav className="flex-1 px-3 mt-1">
        {nav.map((n) => (
          <button
            key={n.page}
            onClick={() => onNavigate(n.page)}
            className={`w-full flex items-center gap-3 px-3 py-2.5 rounded text-[13px] font-medium mb-1 cursor-pointer transition-all border-2 ${
              current === n.page
                ? "bg-[#111827] text-[#00e676] border-[#00e676] shadow-sm"
                : "text-[#94a3b8] hover:bg-[#111827] hover:text-white border-transparent"
            }`}
            style={current === n.page ? {boxShadow: '0 0 10px rgba(0, 230, 118, 0.2)'} : {}}
          >
            <span className="text-base w-5 text-center">{n.icon}</span>
            {n.label}
          </button>
        ))}
      </nav>

      {/* User area */}
      <div className="px-3 pb-4">
        <button
          onClick={() => onNavigate("settings")}
          className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded bg-[#111827] cursor-pointer hover:bg-[#1a2235] border-2 border-[#1e3a5f] text-left"
        >
          <div className="w-8 h-8 rounded bg-[#1a2235] flex items-center justify-center text-xs text-[#64748b] shrink-0">
            {mcUsername ? "⛏" : "?"}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-xs font-medium truncate">{mcUsername || "Not signed in"}</p>
            <p className="text-[10px] text-[#00bcd4]">{mcUsername ? "Minecraft" : "Click to sign in"}</p>
          </div>
        </button>
      </div>
    </div>
  );
}
