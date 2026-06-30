"use client";

import { useCallback, useEffect, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth";
import { api } from "@/lib/api";
import { IngestProvider } from "@/lib/ingest-context";
import { TopBar } from "@/components/shell/TopBar";
import { Sidebar } from "@/components/shell/Sidebar";
import { BottomTabs } from "@/components/shell/BottomTabs";
import { IngestSlideOver } from "@/components/ingest/IngestSlideOver";
import { IngestQuotaNudge } from "@/components/ingest/IngestQuotaNudge";
import { OnboardingCarousel } from "@/components/onboarding/OnboardingCarousel";
import { SpotlightProvider } from "@/components/search/Spotlight";
import { SpinnerIcon } from "@/components/ui/Icon";

// The app shell (design-system §5). Wraps every signed-in screen: top bar +
// sidebar (desktop) / bottom tabs (mobile), the persistent ingest surface, and
// the auth gate (unauthenticated users bounce to /login).
export default function AppLayout({ children }: { children: ReactNode }) {
  const router = useRouter();
  const { user, loading, updateUser } = useAuth();

  useEffect(() => {
    if (!loading && !user) router.replace("/login");
  }, [loading, user, router]);

  // First-run onboarding: shown once per account. Marking it seen returns the
  // refreshed principal (onboardedAt now set), which flips the gate below and
  // unmounts the carousel.
  const completeOnboarding = useCallback(async () => {
    const updated = await api.completeOnboarding();
    updateUser(updated);
  }, [updateUser]);

  if (loading || !user) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <SpinnerIcon className="h-6 w-6 animate-spin text-muted" title="Loading" />
      </div>
    );
  }

  return (
    <IngestProvider>
      <SpotlightProvider>
        <div className="flex min-h-screen flex-col">
          <TopBar />
          {/* Approaching-ingest-limit upgrade nudge (§4/§5) — celebratory, dismissible,
              app-wide; renders nothing until the workspace nears its parse ceiling. */}
          <IngestQuotaNudge />
          <div className="flex flex-1">
            <Sidebar />
            {/* pb-16 leaves room for the mobile bottom tab bar. */}
            <main className="min-w-0 flex-1 pb-16 lg:pb-0">{children}</main>
          </div>
          <BottomTabs />
          <IngestSlideOver />
        </div>
        {!user.onboardedAt ? <OnboardingCarousel onComplete={completeOnboarding} /> : null}
      </SpotlightProvider>
    </IngestProvider>
  );
}
