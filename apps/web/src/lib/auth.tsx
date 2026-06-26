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
import { useRouter } from "next/navigation";
import type { AuthResponse, AuthUserDto } from "@hiredesq/shared";
import { authStore } from "@/lib/api";

// (auth context value declared below)

// Small auth context: hydrates the stored AuthUserDto on mount, exposes the
// current user + sign-in/out helpers. Token storage itself lives in api.ts.

interface AuthContextValue {
  user: AuthUserDto | null;
  /** True until the first client-side hydration completes (avoids redirect flash). */
  loading: boolean;
  setSession: (res: AuthResponse) => void;
  /** Update just the current user (profile/avatar/theme edits) — tokens unchanged. */
  updateUser: (user: AuthUserDto) => void;
  signOut: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const [user, setUser] = useState<AuthUserDto | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setUser(authStore.getUser());
    setLoading(false);
  }, []);

  const setSession = useCallback((res: AuthResponse) => {
    authStore.set(res);
    setUser(res.user);
  }, []);

  const updateUser = useCallback((next: AuthUserDto) => {
    authStore.setUser(next);
    setUser(next);
  }, []);

  const signOut = useCallback(() => {
    authStore.clear();
    setUser(null);
    router.replace("/login");
  }, [router]);

  const value = useMemo(
    () => ({ user, loading, setSession, updateUser, signOut }),
    [user, loading, setSession, updateUser, signOut],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
