"use client";

import type { ReactNode } from "react";
import { GoogleOAuthProvider } from "@react-oauth/google";
import { AuthProvider } from "@/lib/auth";
import { ThemeProvider } from "@/lib/theme";
import { TourProvider } from "@/lib/tour";
import { ToastProvider } from "@/components/ui/Toast";

// App-wide client providers (auth session + theme + toasts). Kept in one client
// boundary so the root layout stays a server component. ThemeProvider sits inside
// AuthProvider because it adopts the signed-in user's saved theme preference.
//
// GoogleOAuthProvider wraps everything so the "Sign in with Google" buttons on the
// auth screens can mint an ID token. The client ID is a public value (not a secret);
// when it's unset (e.g. a fresh local checkout) the Google button simply hides itself.
export function Providers({ children }: { children: ReactNode }) {
  return (
    <GoogleOAuthProvider clientId={process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID ?? ""}>
      <AuthProvider>
        <ThemeProvider>
          <ToastProvider>
            <TourProvider>{children}</TourProvider>
          </ToastProvider>
        </ThemeProvider>
      </AuthProvider>
    </GoogleOAuthProvider>
  );
}
