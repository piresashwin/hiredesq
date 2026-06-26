"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useGoogleLogin } from "@react-oauth/google";
import { api, ApiError, isTwoFactorChallenge } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { detectTimezone } from "@/lib/timezone";
import { Button } from "@/components/ui/Button";
import { SpinnerIcon } from "@/components/ui/Icon";

// Official four-colour Google "G". Inline (not Lucide) because brand guidelines
// require the exact mark; sized to the button's text via 1em so it tracks the label.
function GoogleGlyph() {
  return (
    <svg viewBox="0 0 18 18" className="h-[1.125em] w-[1.125em]" aria-hidden="true">
      <path
        fill="#4285F4"
        d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844a4.14 4.14 0 0 1-1.796 2.716v2.259h2.908c1.702-1.567 2.684-3.875 2.684-6.615z"
      />
      <path
        fill="#34A853"
        d="M9 18c2.43 0 4.467-.806 5.956-2.184l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18z"
      />
      <path
        fill="#FBBC05"
        d="M3.964 10.706A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.706V4.962H.957A8.997 8.997 0 0 0 0 9c0 1.452.348 2.827.957 4.038l3.007-2.332z"
      />
      <path
        fill="#EA4335"
        d="M9 3.583c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.962L3.964 7.294C4.672 5.167 6.656 3.583 9 3.583z"
      />
    </svg>
  );
}

// Shared "Continue with Google" control for the login and signup screens, styled as a
// design-system `secondary` Button (white surface, line border, ink text) — Principle
// 7, calm by default; colour lives only in the Google mark. One Google endpoint
// find-or-creates the user, so this same button serves both screens; `redirectTo`
// just picks where to land. Renders nothing when no client ID is configured (a fresh
// local checkout), so the password form still works on its own.
//
// Auth-code (popup) flow: Google hands us a one-time code, the API exchanges it
// server-side and returns our own session — so the button can be fully custom-styled
// (the credential-iframe button can't be).
export function GoogleSignInButton({
  redirectTo,
  onError,
  onTwoFactor,
}: {
  redirectTo: string;
  onError: (message: string) => void;
  /** Called when the (returning) Google account has 2FA on — hands back the
   * challenge token so the host page can collect a code. Omitted on signup, where
   * a brand-new Google account never has 2FA. */
  onTwoFactor?: (challengeToken: string) => void;
}) {
  const router = useRouter();
  const { setSession } = useAuth();
  const [submitting, setSubmitting] = useState(false);

  const start = useGoogleLogin({
    flow: "auth-code",
    onSuccess: async ({ code }) => {
      try {
        // timezone seeds a brand-new Google account's timezone + country; the API
        // ignores it for a returning account.
        const session = await api.googleAuth(code, detectTimezone());
        if (isTwoFactorChallenge(session)) {
          setSubmitting(false);
          if (onTwoFactor) onTwoFactor(session.challengeToken);
          else onError("This account requires two-factor authentication. Sign in with email instead.");
          return;
        }
        setSession(session);
        router.replace(redirectTo);
      } catch (err) {
        setSubmitting(false);
        onError(err instanceof ApiError ? err.message : "We couldn't sign you in with Google.");
      }
    },
    onError: () => {
      setSubmitting(false);
      onError("We couldn't sign you in with Google. Please try again.");
    },
    // The user closed the popup / dismissed consent — not an error worth alarming them.
    onNonOAuthError: () => setSubmitting(false),
  });

  if (!process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID) return null;

  return (
    <Button
      variant="secondary"
      size="lg"
      className="w-full"
      disabled={submitting}
      onClick={() => {
        onError(""); // clear any prior error before a fresh attempt
        setSubmitting(true);
        start();
      }}
    >
      {submitting ? (
        <SpinnerIcon className="h-4 w-4 animate-spin" />
      ) : (
        <GoogleGlyph />
      )}
      Continue with Google
    </Button>
  );
}
