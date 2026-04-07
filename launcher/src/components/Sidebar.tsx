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
    <div className="w-[200px] min-w-[200px] bg-[#1a1a1a] flex flex-col border-r-[3px] border-[#5b8731]">
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
                ? "bg-[#3a3a3a] text-white border-[#5b8731] shadow-sm"
                : "text-[#b0b0b0] hover:bg-[#2b2b2b] hover:text-white border-transparent"
            }`}
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
          className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded bg-[#2b2b2b] cursor-pointer hover:bg-[#3a3a3a] border-2 border-[#555] text-left"
        >
          <div className="w-8 h-8 rounded bg-[#484848] flex items-center justify-center text-xs text-[#808080] shrink-0">
            {mcUsername ? "⛏" : "?"}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-xs font-medium truncate">{mcUsername || "Not signed in"}</p>
            <p className="text-[10px] text-[#808080]">{mcUsername ? "Minecraft" : "Click to sign in"}</p>
          </div>
        </button>
      </div>
    </div>
  );
}
