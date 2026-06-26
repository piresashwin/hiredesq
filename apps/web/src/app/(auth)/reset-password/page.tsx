"use client";

import { Suspense, useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { api, ApiError } from "@/lib/api";
import { Button } from "@/components/ui/Button";
import { Field } from "@/components/ui/Field";
import { SpinnerIcon } from "@/components/ui/Icon";
import { AuthSplit } from "@/components/auth/AuthSplit";

// Shares the recovery-flow illustration with the forgot-password screen.
const ASIDE = {
  image: "/onboarding/03-search.webp",
  alt: "A plain-English search over a grid of clean candidate cards",
  eyebrow: "Account recovery",
  headline: "Let's get you back to your desk.",
  sub: "Set a new password and pick up right where you left off — your candidate pool is waiting.",
} as const;

// Complete a password reset using the emailed token (?token=...). On success we
// bounce to the login page with a success note.
function ResetForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get("token") ?? "";

  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const tooShort = next.length > 0 && next.length < 8;
  const mismatch = confirm.length > 0 && confirm !== next;
  const valid = next.length >= 8 && next === confirm && token.length > 0;

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!valid || submitting) return;
    setError(null);
    setSubmitting(true);
    try {
      await api.resetPassword({ token, newPassword: next });
      router.replace("/login?reset=1");
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message
          : "We couldn't reset your password. The link may have expired.",
      );
      setSubmitting(false);
    }
  }

  if (!token) {
    return (
      <AuthSplit aside={ASIDE}>
        <h1 className="mt-8 text-h2 text-ink">Invalid reset link</h1>
        <p className="mt-1 text-body text-muted">
          This link is missing its token. Request a fresh one and try again.
        </p>
        <Link
          href="/forgot-password"
          className="mt-5 inline-block text-sm font-medium text-brand hover:text-brand-hover"
        >
          Request a new link
        </Link>
      </AuthSplit>
    );
  }

  return (
    <AuthSplit aside={ASIDE}>
      <h1 className="mt-8 text-h2 text-ink">Set a new password</h1>
      <p className="mt-1 text-body text-muted">Choose a password you don&apos;t use elsewhere.</p>

      <form onSubmit={onSubmit} className="mt-6 space-y-4" noValidate>
        {error ? (
          <div role="alert" className="rounded-sm bg-danger-tint px-3 py-2 text-sm text-danger">
            {error}
          </div>
        ) : null}
        <Field
          label="New password"
          name="newPassword"
          type="password"
          autoComplete="new-password"
          required
          value={next}
          onChange={(e) => setNext(e.target.value)}
          error={tooShort ? "At least 8 characters." : undefined}
          hint={tooShort ? undefined : "At least 8 characters."}
        />
        <Field
          label="Confirm new password"
          name="confirmPassword"
          type="password"
          autoComplete="new-password"
          required
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          error={mismatch ? "Passwords don't match." : undefined}
        />
        <Button
          type="submit"
          variant="primary"
          size="lg"
          className="w-full"
          disabled={!valid || submitting}
        >
          {submitting ? (
            <>
              <SpinnerIcon className="h-4 w-4 animate-spin" />
              Saving…
            </>
          ) : (
            "Reset password"
          )}
        </Button>
      </form>
    </AuthSplit>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={null}>
      <ResetForm />
    </Suspense>
  );
}
