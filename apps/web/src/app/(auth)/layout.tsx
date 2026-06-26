import type { ReactNode } from "react";

// Auth routes get no app shell — a calm, centered, single-column surface so the
// sign-up / sign-in moment feels reassuring, not technical (Priya is not a power
// user). The warm canvas + a quiet brand wordmark do the branding.
export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center px-5 py-12">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <span className="text-h2 font-semibold tracking-tight text-brand">Hiredesq</span>
          <p className="mt-1 text-sm text-muted">
            Your recruiting desk, finally in one place.
          </p>
        </div>
        {children}
      </div>
    </main>
  );
}
