"use client";

import Link from "next/link";
import { Logo } from "@/components/marketing/Logo";
import { CreditMeter } from "@/components/shell/CreditMeter";
import { NotificationBell } from "@/components/shell/NotificationBell";
import { ProfileMenu } from "@/components/shell/ProfileMenu";
import { TourButton } from "@/components/shell/TourButton";

// Top bar (design-system §5): the logo lock-up and the credit-meter pill. The
// "Add candidates" CTA now lives on the candidates page (where ingest belongs),
// and the profile menu lives at the sidebar bottom on desktop — so on mobile,
// where the sidebar is hidden, we surface a compact profile avatar here instead.
export function TopBar() {
  return (
    <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b border-line bg-surface px-4 sm:px-6 lg:px-8">
      <Link href="/home" aria-label="Hiredesq home" className="rounded-sm transition hover:opacity-80">
        <Logo />
      </Link>

      <div className="ml-auto flex items-center gap-2 sm:gap-3">
        <TourButton />
        <NotificationBell />
        <CreditMeter />
        <div className="lg:hidden">
          <ProfileMenu variant="icon" />
        </div>
      </div>
    </header>
  );
}
