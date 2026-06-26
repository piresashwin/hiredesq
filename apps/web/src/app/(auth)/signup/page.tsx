"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { api, ApiError } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { detectTimezone } from "@/lib/timezone";
import { Button } from "@/components/ui/Button";
import { Field } from "@/components/ui/Field";
import { SpinnerIcon } from "@/components/ui/Icon";
import { GoogleSignInButton } from "@/components/auth/GoogleSignInButton";
import { AuthSplit } from "@/components/auth/AuthSplit";

export default function SignupPage() {
  const router = useRouter();
  const { setSession } = useAuth();
  const [fullName, setFullName] = useState("");
  const [workspaceName, setWorkspaceName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const res = await api.signup({
        fullName,
        workspaceName,
        email,
        password,
        // Auto-detected so the new account lands on the right timezone + country
        // without an extra signup field.
        timezone: detectTimezone(),
      });
      setSession(res);
      router.replace("/candidates");
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message
          : "We couldn't create your account. Please try again.",
      );
      setSubmitting(false);
    }
  }

  return (
    <AuthSplit
      aside={{
        image: "/onboarding/01-chaos.webp",
        alt: "Resumes, chat bubbles, an email and a phone scattered in disorder",
        eyebrow: "Start your desk",
        headline: "Your candidates are everywhere. Today that ends.",
        sub: "No setup, no demo, no credit card. Forward the mess and watch it become a clean, searchable candidate pool.",
      }}
    >
      <h1 className="mt-8 text-h2 text-ink">Start your desk</h1>
      <p className="mt-1 text-body text-muted">
        No setup, no demo. You&apos;ll be cleaning up candidates in a minute.
      </p>

      <form onSubmit={onSubmit} className="mt-6 space-y-4" noValidate>
        {error ? (
          <div role="alert" className="rounded-sm bg-danger-tint px-3 py-2 text-sm text-danger">
            {error}
          </div>
        ) : null}

        <Field
          label="Your name"
          name="fullName"
          autoComplete="name"
          required
          value={fullName}
          onChange={(e) => setFullName(e.target.value)}
          placeholder="Priya Sharma"
        />
        <Field
          label="Agency / workspace name"
          name="workspaceName"
          autoComplete="organization"
          required
          value={workspaceName}
          onChange={(e) => setWorkspaceName(e.target.value)}
          placeholder="Sharma Talent"
          hint="You can rename this later."
        />
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
          autoComplete="new-password"
          required
          minLength={8}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="At least 8 characters"
        />

        <Button type="submit" variant="primary" size="lg" className="w-full" disabled={submitting}>
          {submitting ? (
            <>
              <SpinnerIcon className="h-4 w-4 animate-spin" />
              Creating your desk…
            </>
          ) : (
            "Create my desk"
          )}
        </Button>
      </form>

      <div className="my-5 flex items-center gap-3 text-xs text-muted">
        <span className="h-px flex-1 bg-line" />
        or
        <span className="h-px flex-1 bg-line" />
      </div>

      <GoogleSignInButton redirectTo="/candidates" onError={setError} />

      <p className="mt-5 text-center text-sm text-muted">
        Already have an account?{" "}
        <Link href="/login" className="font-medium text-brand hover:text-brand-hover">
          Sign in
        </Link>
      </p>
    </AuthSplit>
  );
}
