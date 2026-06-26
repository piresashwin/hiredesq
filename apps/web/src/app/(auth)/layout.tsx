import type { ReactNode } from "react";

// Auth routes get no app shell — just a calm, centered surface on the warm
// canvas so the sign-up / sign-in moment feels reassuring, not technical (Priya
// is not a power user). Each auth page renders its own two-panel `AuthSplit` box
// (illustration + form, with the brand lock-up), so the layout only centers it.
export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center px-5 py-12">
      {children}
    </main>
  );
}
