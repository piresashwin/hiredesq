"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { api, ApiError, isTwoFactorChallenge } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/Button";
import { Field } from "@/components/ui/Field";
import { SpinnerIcon } from "@/components/ui/Icon";
import { GoogleSignInButton } from "@/components/auth/GoogleSignInButton";

export default function LoginPage() {
  const router = useRouter();
  const { setSession } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  // Set once the first factor passes for a 2FA account — switches the form to the
  // code step. The challenge token bridges the two steps of a single sign-in.
  const [challengeToken, setChallengeToken] = useState<string | null>(null);
  const [code, setCode] = useState("");
  // Set after a successful password reset (redirected to /login?reset=1).
  const [resetDone] = useState(
    () => typeof window !== "undefined" && new URLSearchParams(window.location.search).get("reset") === "1",
  );

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const res = await api.login({ email, password });
      if (isTwoFactorChallenge(res)) {
        setChallengeToken(res.challengeToken);
        setSubmitting(false);
        return;
      }
      setSession(res);
      router.replace("/home");
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message
          : "We couldn't sign you in. Please try again.",
      );
      setSubmitting(false);
    }
  }

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
      setError(
        err instanceof ApiError ? err.message : "That code didn't work. Please try again.",
      );
      setSubmitting(false);
    }
  }

  if (challengeToken) {
    return (
      <div className="rounded-lg border border-line bg-surface p-6 shadow-sm">
        <h1 className="text-h2 text-ink">Two-factor authentication</h1>
        <p className="mt-1 text-body text-muted">
          Enter the 6-digit code from your authenticator app.
        </p>
        <form onSubmit={onSubmitCode} className="mt-6 space-y-4" noValidate>
          {error ? (
            <div role="alert" className="rounded-sm bg-danger-tint px-3 py-2 text-sm text-danger">
              {error}
            </div>
          ) : null}
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
        <button
          type="button"
          onClick={() => {
            setChallengeToken(null);
            setCode("");
            setError(null);
          }}
          className="mt-5 w-full text-center text-sm font-medium text-muted hover:text-ink"
        >
          Back to sign in
        </button>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-line bg-surface p-6 shadow-sm">
      <h1 className="text-h2 text-ink">Welcome back</h1>
      <p className="mt-1 text-body text-muted">Pick up right where you left off.</p>

      <form onSubmit={onSubmit} className="mt-6 space-y-4" noValidate>
        {resetDone && !error ? (
          <div role="status" className="rounded-sm bg-success-tint px-3 py-2 text-sm text-money">
            Password reset — sign in with your new password.
          </div>
        ) : null}
        {error ? (
          <div role="alert" className="rounded-sm bg-danger-tint px-3 py-2 text-sm text-danger">
            {error}
          </div>
        ) : null}

        <Field
          label="Email"
          name="email"
          type="email"
          autoComplete="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@agency.com"
        />
        <Field
          label="Password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="••••••••"
        />

        <div className="-mt-1 text-right">
          <Link
            href="/forgot-password"
            className="text-sm font-medium text-brand hover:text-brand-hover"
          >
            Forgot password?
          </Link>
        </div>

        <Button
          type="submit"
          variant="primary"
          size="lg"
          className="w-full"
          disabled={submitting}
        >
          {submitting ? (
            <>
              <SpinnerIcon className="h-4 w-4 animate-spin" />
              Signing in…
            </>
          ) : (
            "Sign in"
          )}
        </Button>
      </form>

      <div className="my-5 flex items-center gap-3 text-xs text-muted">
        <span className="h-px flex-1 bg-line" />
        or
        <span className="h-px flex-1 bg-line" />
      </div>

      <GoogleSignInButton
        redirectTo="/home"
        onError={setError}
        onTwoFactor={(t) => setChallengeToken(t)}
      />

      <p className="mt-5 text-center text-sm text-muted">
        New to Hiredesq?{" "}
        <Link href="/signup" className="font-medium text-brand hover:text-brand-hover">
          Create an account
        </Link>
      </p>
    </div>
  );
}
