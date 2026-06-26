"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { cn } from "@/lib/cn";
import { useAuth } from "@/lib/auth";
import { useFocusTrap } from "@/lib/useFocusTrap";
import { ChevronDownIcon } from "@/components/ui/Icon";

// The account/profile menu (design-system §5). Lives at the sidebar bottom on
// desktop (`variant="bar"`, opens upward) and as a compact avatar in the header
// on mobile (`variant="icon"`, opens downward) — the sidebar is hidden there, so
// the menu must stay reachable. Shows the uploaded avatar when set, else initials.
// The dropdown is positioned within a non-clipping container (the sidebar/header),
// so it doesn't need the portal treatment the table/kanban menus do.

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
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  useFocusTrap(menuRef, open, () => setOpen(false));

  useEffect(() => {
    if (!open) return;
    function onClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [open]);

  const name = user?.fullName ?? "";
  const workspace = user?.workspaceName ?? "";
  const avatarUrl = user?.avatarUrl ?? null;

  const menu = open ? (
    <div
      ref={menuRef}
      role="menu"
      aria-label="Account"
      tabIndex={-1}
      className={cn(
        "absolute z-40 w-56 rounded-md border border-line bg-surface p-1.5 shadow-md outline-none",
        "motion-safe:animate-[popIn_140ms_ease-out]",
        variant === "bar" ? "bottom-12 left-0" : "right-0 top-10",
      )}
    >
      <div className="px-2.5 py-2">
        <p className="truncate text-body font-medium text-ink">{name}</p>
        <p className="truncate text-sm text-muted">{workspace}</p>
      </div>
      <div className="my-1 border-t border-line" />
      <MenuLink href="/settings/profile" onClick={() => setOpen(false)}>
        Profile settings
      </MenuLink>
      <MenuLink href="/settings/inbox" onClick={() => setOpen(false)}>
        Forwarding inbox
      </MenuLink>
      <MenuLink href="/settings/billing" onClick={() => setOpen(false)}>
        Credits &amp; plan
      </MenuLink>
      <div className="my-1 border-t border-line" />
      <button
        type="button"
        role="menuitem"
        onClick={() => {
          setOpen(false);
          signOut();
        }}
        className="w-full rounded-sm px-2.5 py-2 text-left text-body text-ink transition hover:bg-subtle"
      >
        Sign out
      </button>
    </div>
  ) : null;

  if (variant === "icon") {
    return (
      <div className="relative" ref={ref}>
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-haspopup="menu"
          aria-expanded={open}
          aria-label="Account menu"
          className="flex rounded-full focus-visible:outline-none"
        >
          <Avatar name={name} avatarUrl={avatarUrl} />
        </button>
        {menu}
      </div>
    );
  }

  // variant === "bar" — full-width row at the sidebar bottom.
  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Account menu"
        className="flex w-full items-center gap-2.5 rounded-md px-2 py-2 text-left transition hover:bg-subtle"
      >
        <Avatar name={name} avatarUrl={avatarUrl} />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-body font-medium text-ink">{name || "Account"}</span>
          <span className="block truncate text-label text-muted">{workspace}</span>
        </span>
        <ChevronDownIcon className={cn("h-4 w-4 shrink-0 text-faint transition", open && "rotate-180")} />
      </button>
      {menu}
    </div>
  );
}

function MenuLink({
  href,
  onClick,
  children,
}: {
  href: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      role="menuitem"
      onClick={onClick}
      className="block rounded-sm px-2.5 py-2 text-body text-ink transition hover:bg-subtle"
    >
      {children}
    </Link>
  );
}
