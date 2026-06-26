"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";

// Wires the persistent top-bar "+ Add candidates" button (which lives in the
// shell) to the ingest surface, and lets the candidate list know when a parse
// produced new candidates so it can refresh. Decoupled via context so the button
// and the list don't need to be siblings.

interface IngestContextValue {
  /** Whether the ingest surface (slide-over) is open. */
  open: boolean;
  openIngest: () => void;
  closeIngest: () => void;
  /** Increments whenever a parse completes — list screens watch this to reload. */
  parsedSignal: number;
  notifyParsed: () => void;
  /** Increments whenever the daily credit balance changes (a submission was
   * generated) — the top-bar CreditMeter watches this to refresh without a reload. */
  creditsSignal: number;
  notifyCreditsChanged: () => void;
}

const IngestContext = createContext<IngestContextValue | null>(null);

export function IngestProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const [parsedSignal, setParsedSignal] = useState(0);
  const [creditsSignal, setCreditsSignal] = useState(0);

  const openIngest = useCallback(() => setOpen(true), []);
  const closeIngest = useCallback(() => setOpen(false), []);
  const notifyParsed = useCallback(() => setParsedSignal((n) => n + 1), []);
  const notifyCreditsChanged = useCallback(() => setCreditsSignal((n) => n + 1), []);

  const value = useMemo(
    () => ({
      open,
      openIngest,
      closeIngest,
      parsedSignal,
      notifyParsed,
      creditsSignal,
      notifyCreditsChanged,
    }),
    [open, openIngest, closeIngest, parsedSignal, notifyParsed, creditsSignal, notifyCreditsChanged],
  );

  return <IngestContext.Provider value={value}>{children}</IngestContext.Provider>;
}

export function useIngest(): IngestContextValue {
  const ctx = useContext(IngestContext);
  if (!ctx) throw new Error("useIngest must be used within IngestProvider");
  return ctx;
}
