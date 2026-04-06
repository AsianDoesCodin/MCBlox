export default function Friends() {
  return (
    <div className="h-full flex flex-col">
      {/* Top bar */}
      <div className="flex items-center gap-3 px-6 py-3 bg-[#1a1a1a] border-b-[3px] border-[#5b8731] shrink-0">
        <h1 className="text-base font-bold" style={{fontFamily: "'Silkscreen', monospace", color: '#ffaa00'}}>Friends</h1>
      </div>

      <div className="flex-1 overflow-y-auto p-6">
        {/* Connect Discord */}
        <div className="bg-[#3a3a3a] rounded p-6 border-2 border-[#555] mb-6" style={{borderBottom: '4px solid rgba(0,0,0,0.3)'}}>
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded bg-[#5865F2] flex items-center justify-center text-2xl shrink-0">
              💬
            </div>
            <div className="flex-1">
              <h2 className="font-bold text-sm">Connect Discord</h2>
              <p className="text-xs text-[#b0b0b0] mt-0.5">
                Link your Discord to find friends and see what they're playing.
              </p>
            </div>
            <button className="px-5 py-2 bg-[#5865F2] hover:bg-[#4752C4] rounded text-white font-semibold text-sm cursor-pointer border-b-[3px] border-[rgba(0,0,0,0.3)]">
              Link Account
            </button>
          </div>
        </div>

        {/* Online Friends */}
        <div className="mb-6">
          <h2 className="text-sm font-bold text-[#ffaa00] uppercase tracking-wider mb-3" style={{fontFamily: "'Silkscreen', monospace"}}>
            Online — 0
          </h2>
          <div className="bg-[#3a3a3a] rounded border-2 border-[#555] p-8 text-center">
            <span className="text-4xl mb-3 block">👥</span>
            <p className="text-sm text-[#808080]">No friends online</p>
            <p className="text-xs text-[#808080] mt-1">Friends will appear here when they're playing</p>
          </div>
        </div>

        {/* Add Friend */}
        <div>
          <h2 className="text-sm font-bold text-[#ffaa00] uppercase tracking-wider mb-3" style={{fontFamily: "'Silkscreen', monospace"}}>
            Add Friend
          </h2>
          <div className="flex gap-3">
            <input
              type="text"
              placeholder="Enter a username..."
              className="flex-1 px-4 py-2.5 bg-[#2b2b2b] border-2 border-[#555] rounded text-sm text-white outline-none focus:border-[#5b8731] placeholder:text-[#808080]"
            />
            <button className="px-5 py-2.5 bg-[#5b8731] hover:bg-[#6b9b3a] rounded text-white font-semibold text-sm cursor-pointer border-b-[3px] border-[rgba(0,0,0,0.3)]" style={{fontFamily: "'Silkscreen', monospace"}}>
              Send Request
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
