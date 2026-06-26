"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { cn } from "@/lib/cn";
import { AlertIcon, CheckIcon, CloseIcon } from "@/components/ui/Icon";

// Toasts (design-system §6.8): bottom-center, auto-dismiss. Success (money/win)
// in green; errors persist with a dismiss. Polite live region for a11y.

type ToastTone = "success" | "error" | "info";

interface ToastItem {
  id: number;
  tone: ToastTone;
  message: string;
}

interface ToastContextValue {
  toast: (message: string, tone?: ToastTone) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const nextId = useRef(1);

  const dismiss = useCallback((id: number) => {
    setItems((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const toast = useCallback(
    (message: string, tone: ToastTone = "info") => {
      const id = nextId.current++;
      setItems((prev) => [...prev, { id, tone, message }]);
      // Errors stay until dismissed; success/info auto-clear.
      if (tone !== "error") {
        window.setTimeout(() => dismiss(id), 4000);
      }
    },
    [dismiss],
  );

  const value = useMemo(() => ({ toast }), [toast]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div
        className="pointer-events-none fixed inset-x-0 bottom-4 z-[60] flex flex-col items-center gap-2 px-4"
        aria-live="polite"
        aria-atomic="false"
      >
        {items.map((t) => (
          <div
            key={t.id}
            role={t.tone === "error" ? "alert" : "status"}
            className={cn(
              "pointer-events-auto flex items-center gap-2.5 rounded-md px-3.5 py-2.5 text-body shadow-md",
              "motion-safe:animate-[popIn_140ms_ease-out] max-w-md",
              t.tone === "success" && "bg-success-tint text-money",
              t.tone === "error" && "bg-danger-tint text-danger",
              t.tone === "info" && "bg-ink text-white",
            )}
          >
            {t.tone === "success" ? (
              <CheckIcon className="h-4 w-4 shrink-0" />
            ) : t.tone === "error" ? (
              <AlertIcon className="h-4 w-4 shrink-0" />
            ) : null}
            <span className="font-medium">{t.message}</span>
            {t.tone === "error" ? (
              <button
                type="button"
                onClick={() => dismiss(t.id)}
                aria-label="Dismiss"
                className="-mr-1 rounded p-0.5 hover:opacity-70"
              >
                <CloseIcon className="h-4 w-4" />
              </button>
            ) : null}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used within ToastProvider");
  return ctx;
}
