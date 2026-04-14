type Page = "home" | "library" | "settings";

interface Props {
  current: Page;
  onNavigate: (page: Page) => void;
  mcUsername?: string | null;
}

const nav: { page: Page; label: string; icon: string }[] = [
  { page: "home", label: "Discover", icon: "⛏" },
  { page: "library", label: "Library", icon: "📚" },
  { page: "settings", label: "Settings", icon: "⚙" },
];

export default function Sidebar({ current, onNavigate, mcUsername }: Props) {
  return (
    <div className="w-[200px] min-w-[200px] bg-[#150e28] flex flex-col border-r-2 border-[rgba(184,169,232,0.10)]">
      {/* Logo */}
      <div className="px-5 py-5 flex items-center gap-2.5">
        <img src="/mcbloxlogo2.png" alt="McBlox" className="h-10 w-auto rounded-full" />
        <span className="text-base font-bold">McBlox</span>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-3 mt-1">
        {nav.map((n) => (
          <button
            key={n.page}
            onClick={() => onNavigate(n.page)}
            className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-[13px] font-semibold mb-1 cursor-pointer transition-all border-2 ${
              current === n.page
                ? "bg-[#231a42] text-[#e8956a] border-[rgba(232,149,106,0.2)]"
                : "text-[#8b82a8] hover:bg-[#231a42] hover:text-[#f0edf7] border-transparent"
            }`}
            style={current === n.page ? {boxShadow: '0 0 12px rgba(232,149,106,0.08)'} : {}}
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
          className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-lg bg-[#231a42] cursor-pointer hover:bg-[#2d2250] border border-[rgba(184,169,232,0.10)] text-left"
        >
          <div className="w-8 h-8 rounded-full flex items-center justify-center text-xs shrink-0" style={{background: 'linear-gradient(135deg, #e8956a, #d4709a)'}}>
            <span style={{color: '#fff', fontWeight: 700}}>{mcUsername ? "⛏" : "?"}</span>
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-xs font-semibold truncate">{mcUsername || "Not signed in"}</p>
            <p className="text-[10px] text-[#b8a9e8]">{mcUsername ? "Minecraft" : "Click to sign in"}</p>
          </div>
        </button>
      </div>
    </div>
  );
}
