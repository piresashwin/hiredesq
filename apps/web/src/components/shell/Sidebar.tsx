"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/cn";
import { BriefcaseIcon, HomeIcon, SearchIcon, TrendingUpIcon, UsersIcon } from "@/components/ui/Icon";
import { useSpotlight } from "@/components/search/Spotlight";
import { ProfileMenu } from "@/components/shell/ProfileMenu";

// Left sidebar (desktop). Home (the account-at-a-glance landing) + the three core
// surfaces — Candidates, Jobs, Revenue — and a Search (⌘K) entry. Resist menu
// growth beyond this: each item is a vote against "zero config to value".

const NAV = [
  { href: "/home", label: "Home", Icon: HomeIcon },
  { href: "/candidates", label: "Candidates", Icon: UsersIcon },
  { href: "/jobs", label: "Jobs", Icon: BriefcaseIcon },
  { href: "/revenue", label: "Revenue", Icon: TrendingUpIcon },
] as const;

export function Sidebar() {
  const pathname = usePathname();
  const spotlight = useSpotlight();

  return (
    <nav
      aria-label="Primary"
      className="hidden w-56 shrink-0 flex-col border-r border-line bg-surface px-3 py-4 lg:flex"
    >
      <ul className="space-y-1">
        {NAV.map(({ href, label, Icon }) => {
          const active = pathname.startsWith(href);
          return (
            <li key={href}>
              <Link
                href={href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex items-center gap-2.5 rounded-md px-3 py-2 text-body transition",
                  active
                    ? "bg-brand-tint font-semibold text-brand"
                    : "text-muted hover:bg-subtle hover:text-ink",
                )}
              >
                <Icon className="h-[18px] w-[18px]" />
                {label}
              </Link>
            </li>
          );
        })}
      </ul>

      <div className="my-3 border-t border-line" />

      {/* Opens the ⌘K spotlight (semantic candidate search). */}
      <button
        type="button"
        onClick={spotlight.open}
        className="flex items-center justify-between rounded-md border border-line px-3 py-2 text-sm text-muted transition hover:bg-subtle hover:text-ink"
      >
        <span className="flex items-center gap-2.5">
          <SearchIcon className="h-[18px] w-[18px]" />
          Search
        </span>
        <kbd className="rounded border border-line bg-subtle px-1.5 py-0.5 text-[11px] font-medium text-muted">
          ⌘K
        </kbd>
      </button>

      {/* Account/profile pinned to the bottom (design-system §5). */}
      <div className="mt-auto border-t border-line pt-3">
        <ProfileMenu variant="bar" />
      </div>
    </nav>
  );
}
