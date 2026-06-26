"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type { ThemePreference } from "@hiredesq/shared";
import { themeStore } from "@/lib/api";
import { useAuth } from "@/lib/auth";

// Theme runtime. The preference (light | dark | system) is the source of truth on
// the user account (synced across devices); we mirror it into localStorage so the
// no-flash boot script in the root layout can paint the right palette before React
// hydrates. This provider keeps <html data-theme> in sync with the preference and,
// for "system", with the OS color-scheme. Apply via the [data-theme] token override
// in globals.css — every component reads the tokens, so it adapts for free.

interface ThemeContextValue {
  preference: ThemePreference;
  /** The resolved palette actually applied right now (system → light|dark). */
  resolved: "light" | "dark";
  /** Apply + cache immediately (the profile page also persists it to the account). */
  setPreference: (next: ThemePreference) => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

function systemDark(): boolean {
  return (
    typeof window !== "undefined" &&
    window.matchMedia("(prefers-color-scheme: dark)").matches
  );
}

function resolve(pref: ThemePreference): "light" | "dark" {
  return pref === "system" ? (systemDark() ? "dark" : "light") : pref;
}

function apply(pref: ThemePreference): "light" | "dark" {
  const r = resolve(pref);
  if (typeof document !== "undefined") {
    document.documentElement.setAttribute("data-theme", r);
  }
  return r;
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [preference, setPref] = useState<ThemePreference>(() => themeStore.get() ?? "system");
  const [resolved, setResolved] = useState<"light" | "dark">(() => resolve(preference));

  const setPreference = useCallback((next: ThemePreference) => {
    setPref(next);
    themeStore.set(next);
    setResolved(apply(next));
  }, []);

  // Re-apply whenever the preference changes.
  useEffect(() => {
    setResolved(apply(preference));
  }, [preference]);

  // Follow the OS when on "system".
  useEffect(() => {
    if (preference !== "system" || typeof window === "undefined") return;
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => setResolved(apply("system"));
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, [preference]);

  // Adopt the account's theme once the session hydrates / changes (cross-device).
  useEffect(() => {
    if (user?.theme && user.theme !== preference) setPreference(user.theme);
  }, [user?.theme, preference, setPreference]);

  const value = useMemo<ThemeContextValue>(
    () => ({ preference, resolved, setPreference }),
    [preference, resolved, setPreference],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used within ThemeProvider");
  return ctx;
}
