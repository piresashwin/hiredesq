import type { ReactNode } from "react";
import Link from "next/link";
import { Logo } from "@/components/marketing/Logo";
import { AuthAside, type AuthAsideProps } from "@/components/auth/AuthAside";

// The shared two-panel auth box: a full-bleed illustration hero on the left
// (desktop only) and the page's form on the right, under the Hiredesq lock-up.
// Login, signup, and the password-recovery screens all render their content as
// children here, so the frame, branding, and responsive behaviour stay identical
// across every auth screen.
export function AuthSplit({ aside, children }: { aside: AuthAsideProps; children: ReactNode }) {
  return (
    <div className="w-full max-w-4xl overflow-hidden rounded-lg border border-line bg-surface shadow-lg">
      <div className="grid lg:grid-cols-2">
        <AuthAside {...aside} />
        <div className="p-8 sm:p-10">
          <Link
            href="/"
            aria-label="Hiredesq home"
            className="inline-flex rounded-sm transition hover:opacity-80"
          >
            <Logo />
          </Link>
          {children}
        </div>
      </div>
    </div>
  );
}
