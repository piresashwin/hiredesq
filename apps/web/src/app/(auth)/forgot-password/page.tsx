"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/Button";
import { Field } from "@/components/ui/Field";
import { SpinnerIcon, CheckIcon } from "@/components/ui/Icon";
import { AuthSplit } from "@/components/auth/AuthSplit";

// The recovery flow shares the login/signup split box; this is its illustration.
const ASIDE = {
  image: "/onboarding/03-search.webp",
  alt: "A plain-English search over a grid of clean candidate cards",
  eyebrow: "Account recovery",
  headline: "Let's get you back to your desk.",
  sub: "Reset your password and pick up right where you left off — your candidate pool is waiting.",
} as const;

// Forgot-password request. We always show the same confirmation whether or not
// the email exists (the API returns 204 either way — no account enumeration).
export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [sent, setSent] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    try {
      await api.forgotPassword({ email: email.trim() });
    } catch {
      // Swallow — we never reveal whether the address exists.
    } finally {
      setSubmitting(false);
      setSent(true);
    }
  }

  if (sent) {
    return (
      <AuthSplit aside={ASIDE}>
        <span className="mt-8 flex h-10 w-10 items-center justify-center rounded-full bg-success-tint text-money">
          <CheckIcon className="h-5 w-5" strokeWidth={2.5} />
        </span>
        <h1 className="mt-3 text-h2 text-ink">Check your email</h1>
        <p className="mt-1 text-body text-muted">
          If an account exists for <span className="text-ink">{email.trim()}</span>, we&apos;ve sent
          a link to reset your password. It expires in an hour.
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

  return (
    <AuthSplit aside={ASIDE}>
      <h1 className="mt-8 text-h2 text-ink">Reset your password</h1>
      <p className="mt-1 text-body text-muted">
        Enter your email and we&apos;ll send you a link to set a new one.
      </p>

      <form onSubmit={onSubmit} className="mt-6 space-y-4" noValidate>
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
        <Button
          type="submit"
          variant="primary"
          size="lg"
          className="w-full"
          disabled={submitting || email.trim().length === 0}
        >
          {submitting ? (
            <>
              <SpinnerIcon className="h-4 w-4 animate-spin" />
              Sending…
            </>
          ) : (
            "Send reset link"
          )}
        </Button>
      </form>

      <p className="mt-5 text-center text-sm text-muted">
        <Link href="/login" className="font-medium text-brand hover:text-brand-hover">
          Back to sign in
        </Link>
      </p>
    </AuthSplit>
  );
}
