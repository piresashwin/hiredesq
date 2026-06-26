"use client";

import Link from "next/link";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { cn } from "@/lib/cn";
import { useAuth } from "@/lib/auth";
import { ChevronDownIcon } from "@/components/ui/Icon";

// The account/profile menu (design-system §5). Lives at the sidebar bottom on
// desktop (`variant="bar"`, opens upward) and as a compact avatar in the header
// on mobile (`variant="icon"`, opens downward) — the sidebar is hidden there, so
// the menu must stay reachable. Shows the uploaded avatar when set, else initials.
// Built on Radix DropdownMenu (design-system §6): focus, roving keyboard nav, Esc,
// and click-outside come from Radix; `side`/`align` drive the open direction.

function initialsOf(name: string): string {
  return (
    name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((p) => p[0]?.toUpperCase())
      .join("") || "?"
  );
}

function Avatar({ name, avatarUrl, size = 8 }: { name: string; avatarUrl: string | null; size?: number }) {
  const cls = `h-${size} w-${size}`;
  if (avatarUrl) {
    return <img src={avatarUrl} alt="" className={cn(cls, "shrink-0 rounded-full object-cover")} />;
  }
  return (
    <span
      className={cn(
        cls,
        "flex shrink-0 items-center justify-center rounded-full bg-brand-tint text-label font-semibold text-brand",
      )}
    >
      {initialsOf(name)}
    </span>
  );
}

export function ProfileMenu({ variant }: { variant: "bar" | "icon" }) {
  const { user, signOut } = useAuth();

  const name = user?.fullName ?? "";
  const workspace = user?.workspaceName ?? "";
  const avatarUrl = user?.avatarUrl ?? null;

  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>
        {variant === "icon" ? (
          <button
            type="button"
            aria-label="Account menu"
            className="flex rounded-full focus-visible:outline-none"
          >
            <Avatar name={name} avatarUrl={avatarUrl} />
          </button>
        ) : (
          <button
            type="button"
            aria-label="Account menu"
            className="group flex w-full items-center gap-2.5 rounded-md px-2 py-2 text-left transition hover:bg-subtle"
          >
            <Avatar name={name} avatarUrl={avatarUrl} />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-body font-medium text-ink">{name || "Account"}</span>
              <span className="block truncate text-label text-muted">{workspace}</span>
            </span>
            <ChevronDownIcon className="h-4 w-4 shrink-0 text-faint transition group-data-[state=open]:rotate-180" />
          </button>
        )}
      </DropdownMenu.Trigger>

      <DropdownMenu.Portal>
        <DropdownMenu.Content
          side={variant === "bar" ? "top" : "bottom"}
          align={variant === "bar" ? "start" : "end"}
          sideOffset={6}
          collisionPadding={8}
          className={cn(
            "z-40 w-56 rounded-md border border-line bg-surface p-1.5 shadow-md",
            "motion-safe:animate-[popIn_140ms_ease-out]",
          )}
        >
          <DropdownMenu.Label className="px-2.5 py-2">
            <p className="truncate text-body font-medium text-ink">{name}</p>
            <p className="truncate text-sm text-muted">{workspace}</p>
          </DropdownMenu.Label>
          <DropdownMenu.Separator className="my-1 border-t border-line" />
          <ItemLink href="/settings/profile">Profile settings</ItemLink>
          <ItemLink href="/settings/inbox">Forwarding inbox</ItemLink>
          <ItemLink href="/settings/custom-fields">Candidate fields</ItemLink>
          <ItemLink href="/settings/billing">Credits &amp; plan</ItemLink>
          <DropdownMenu.Separator className="my-1 border-t border-line" />
          <DropdownMenu.Item
            onSelect={() => signOut()}
            className="cursor-pointer rounded-sm px-2.5 py-2 text-body text-ink outline-none transition data-[highlighted]:bg-subtle"
          >
            Sign out
          </DropdownMenu.Item>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}

// A navigating menu item: Radix Item (roving focus + Esc + close-on-select) wrapping
// a Next Link, so keyboard Enter navigates exactly like a click (the shadcn pattern).
function ItemLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <DropdownMenu.Item asChild>
      <Link
        href={href}
        className="block cursor-pointer rounded-sm px-2.5 py-2 text-body text-ink no-underline outline-none transition data-[highlighted]:bg-subtle"
      >
        {children}
      </Link>
    </DropdownMenu.Item>
  );
}
