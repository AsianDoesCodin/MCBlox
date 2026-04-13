import { createContext, useContext, useState, useCallback, type ReactNode } from "react";

type ToastType = "success" | "error" | "warning" | "info";

interface ToastItem {
  id: number;
  message: string;
  type: ToastType;
}

interface ToastContextValue {
  toast: (message: string, type?: ToastType) => void;
}

const ToastContext = createContext<ToastContextValue>({ toast: () => {} });

export function useToast() {
  return useContext(ToastContext);
}

let nextId = 0;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const toast = useCallback((message: string, type: ToastType = "info") => {
    const id = ++nextId;
    setToasts((prev) => [...prev, { id, message, type }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 4000);
  }, []);

  const colors: Record<ToastType, string> = {
    success: "bg-[rgba(111,207,151,0.1)] border-[#6fcf97]",
    error: "bg-[rgba(232,93,93,0.1)] border-[#e85d5d]",
    warning: "bg-[rgba(240,195,94,0.1)] border-[#f0c35e]",
    info: "bg-[rgba(184,169,232,0.1)] border-[#b8a9e8]",
  };

  const icons: Record<ToastType, string> = {
    success: "✓",
    error: "✗",
    warning: "⚠",
    info: "ℹ",
  };

  return (
    <ToastContext.Provider value={{ toast }}>
      {children}
      <div className="fixed top-4 right-4 z-[9999] flex flex-col gap-2 pointer-events-none">
        {toasts.map((t) => (
          <div
            key={t.id}
            className={`pointer-events-auto px-4 py-2.5 rounded border-l-4 text-white text-sm shadow-lg animate-[slideIn_0.3s_ease-out] ${colors[t.type]}`}
            style={{ maxWidth: 360 }}
          >
            <span className="mr-2">{icons[t.type]}</span>
            {t.message}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}
