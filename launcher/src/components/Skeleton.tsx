export function SkeletonGrid({ count }: { count: number }) {
  return (
    <div className="grid grid-cols-[repeat(auto-fill,minmax(160px,1fr))] gap-4">
      {Array.from({ length: count }).map((_, i) => (
        <div
          key={i}
          className="rounded overflow-hidden"
          style={{
            background: "#0a0e1a",
            animation: "skeleton-pulse 1.5s ease-in-out infinite",
          }}
        >
          <div style={{ height: 100, background: "#111827" }} />
          <div style={{ padding: 10 }}>
            <div
              style={{
                height: 12,
                background: "#111827",
                borderRadius: 3,
                width: "75%",
                marginBottom: 8,
              }}
            />
            <div
              style={{
                height: 10,
                background: "#111827",
                borderRadius: 3,
                width: "50%",
                marginBottom: 10,
              }}
            />
            <div style={{ display: "flex", gap: 6 }}>
              <div
                style={{
                  height: 16,
                  background: "#111827",
                  borderRadius: 3,
                  width: 40,
                }}
              />
              <div
                style={{
                  height: 16,
                  background: "#111827",
                  borderRadius: 3,
                  width: 56,
                }}
              />
            </div>
          </div>
        </div>
      ))}
      <style>{`@keyframes skeleton-pulse { 0%,100% { opacity:1; } 50% { opacity:0.5; } }`}</style>
    </div>
  );
}
