"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { api, ApiError } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/Button";
import { Field } from "@/components/ui/Field";
import { SpinnerIcon } from "@/components/ui/Icon";
import { GoogleSignInButton } from "@/components/auth/GoogleSignInButton";

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
      const res = await api.signup({ fullName, workspaceName, email, password });
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
    <div className="rounded-lg border border-line bg-surface p-6 shadow-sm">
      <h1 className="text-h2 text-ink">Start your desk</h1>
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
    </div>
  );
}
