"use client";

import { Suspense, useEffect, useRef, useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { api, ApiError, isTwoFactorChallenge } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/Button";
import { Field } from "@/components/ui/Field";
import { SpinnerIcon } from "@/components/ui/Icon";
import { AuthSplit } from "@/components/auth/AuthSplit";

const ASIDE = {
  image: "/onboarding/02-ingest.webp",
  alt: "Messy inputs resolving into a tidy grid of clean candidate cards",
  eyebrow: "Your recruiting desk",
  headline: "Signing you in…",
  sub: "One click and you're back to your candidate pool — no password required.",
} as const;

// Redeem a passwordless login link (?token=...). On mount we verify the token once;
// it resolves to a session OR — for a 2FA account — a challenge we complete here with
// a TOTP code, exactly like password/Google login.
function MagicLinkForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get("token") ?? "";
  const { setSession } = useAuth();

  const [error, setError] = useState<string | null>(null);
  const [challengeToken, setChallengeToken] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [submitting, setSubmitting] = useState(false);
  // Guards the one-shot verify against React's dev double-invoke of effects (the
  // token is single-use, so a second redeem would always fail).
  const verifiedRef = useRef(false);

  useEffect(() => {
    if (!token || verifiedRef.current) return;
    verifiedRef.current = true;
    let active = true;
    void (async () => {
      try {
        const res = await api.verifyMagicLink({ token });
        if (!active) return;
        if (isTwoFactorChallenge(res)) {
          setChallengeToken(res.challengeToken);
          return;
        }
        setSession(res);
        router.replace("/home");
      } catch (err) {
        if (!active) return;
        setError(
          err instanceof ApiError
            ? err.message
            : "We couldn't sign you in. The link may have expired.",
        );
      }
    })();
    return () => {
      active = false;
    };
  }, [token, router, setSession]);

  async function onSubmitCode(e: FormEvent) {
    e.preventDefault();
    if (!challengeToken) return;
    setError(null);
    setSubmitting(true);
    try {
      const res = await api.completeTwoFactorLogin({ challengeToken, code: code.trim() });
      setSession(res);
      router.replace("/home");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "That code didn't work. Please try again.");
      setSubmitting(false);
    }
  }

  if (!token) {
    return (
      <AuthSplit aside={ASIDE}>
        <h1 className="mt-8 text-h2 text-ink">Invalid login link</h1>
        <p className="mt-1 text-body text-muted">
          This link is missing its token. Request a fresh one and try again.
        </p>
        <Link
          href="/login"
          className="mt-5 inline-block text-sm font-medium text-brand hover:text-brand-hover"
        >
          Back to sign in
        </Link>
      </AuthSplit>
    );
  }

  if (error) {
    return (
      <AuthSplit aside={ASIDE}>
        <h1 className="mt-8 text-h2 text-ink">This link didn&apos;t work</h1>
        <p className="mt-1 text-body text-muted">{error}</p>
        <Link
          href="/login"
          className="mt-5 inline-block text-sm font-medium text-brand hover:text-brand-hover"
        >
          Back to sign in
        </Link>
      </AuthSplit>
    );
  }

  if (challengeToken) {
    return (
      <AuthSplit aside={ASIDE}>
        <h1 className="mt-8 text-h2 text-ink">Two-factor authentication</h1>
        <p className="mt-1 text-body text-muted">
          Enter the 6-digit code from your authenticator app.
        </p>
        <form onSubmit={onSubmitCode} className="mt-6 space-y-4" noValidate>
          <Field
            label="Authentication code"
            name="code"
            inputMode="numeric"
            autoComplete="one-time-code"
            autoFocus
            required
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
            placeholder="123456"
          />
          <Button
            type="submit"
            variant="primary"
            size="lg"
            className="w-full"
            disabled={submitting || code.length < 6}
          >
            {submitting ? (
              <>
                <SpinnerIcon className="h-4 w-4 animate-spin" />
                Verifying…
              </>
            ) : (
              "Verify and sign in"
            )}
          </Button>
        </form>
      </AuthSplit>
    );
  }

  // Verifying in flight — a calm spinner while the token is redeemed.
  return (
    <AuthSplit aside={ASIDE}>
      <h1 className="mt-8 text-h2 text-ink">Signing you in…</h1>
      <p className="mt-1 flex items-center gap-2 text-body text-muted">
        <SpinnerIcon className="h-4 w-4 animate-spin" />
        Just a moment.
      </p>
    </AuthSplit>
  );
}

export default function MagicLinkPage() {
  return (
    <Suspense fallback={null}>
      <MagicLinkForm />
    </Suspense>
  );
}
