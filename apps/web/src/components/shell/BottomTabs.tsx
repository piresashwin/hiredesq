"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/cn";
import { BriefcaseIcon, HomeIcon, TrendingUpIcon, UsersIcon } from "@/components/ui/Icon";

// Mobile bottom tab bar (design-system §9): the sidebar collapses to
// Home · Candidates · Jobs · Revenue on small screens. Adding candidates now
// lives on the candidates page itself (not a global tab).

const TABS = [
  { href: "/home", label: "Home", Icon: HomeIcon },
  { href: "/candidates", label: "Candidates", Icon: UsersIcon },
  { href: "/jobs", label: "Jobs", Icon: BriefcaseIcon },
  { href: "/revenue", label: "Revenue", Icon: TrendingUpIcon },
] as const;

export function BottomTabs() {
  const pathname = usePathname();

  return (
    <nav
      aria-label="Primary"
      className="fixed inset-x-0 bottom-0 z-40 flex border-t border-line bg-surface lg:hidden"
    >
      {TABS.map(({ href, label, Icon }) => {
        const active = pathname.startsWith(href);
        return (
          <Link
            key={href}
            href={href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "flex flex-1 flex-col items-center gap-0.5 py-2 text-[11px] font-medium transition",
              active ? "text-brand" : "text-muted",
            )}
          >
            <Icon className="h-[22px] w-[22px]" />
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
