"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import * as Popover from "@radix-ui/react-popover";
import type { NotificationDto } from "@hiredesq/shared";
import { api } from "@/lib/api";
import { cn } from "@/lib/cn";
import { timeAgo } from "@/lib/format";
import { BellIcon, CheckIcon } from "@/components/ui/Icon";

// In-app notification bell (design-system §5 — header chrome). An unread-count
// badge over a bell button; the dropdown lists the most recent notifications with
// their relative time. Clicking a row marks it read and navigates to its link
// target; "Mark all read" clears the badge. The unread count polls every 60s and
// re-fetches on window focus so the badge stays fresh without a reload. Degrades
// silently if the API can't be reached — it's chrome, not a gate. No PII is ever
// rendered here beyond the server-rendered title/body (counts/ids only, §2).

const POLL_MS = 60_000;
const DROPDOWN_LIMIT = 10;

export function NotificationBell() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [unread, setUnread] = useState(0);
  const [items, setItems] = useState<NotificationDto[]>([]);
  const [loading, setLoading] = useState(false);

  // Poll the unread count on mount, every 60s, and whenever the tab regains focus.
  const refreshCount = useCallback(() => {
    api
      .notificationUnreadCount()
      .then((c) => setUnread(c.count))
      .catch(() => {
        // chrome only — leave the last-known count if the call fails
      });
  }, []);

  useEffect(() => {
    refreshCount();
    const interval = window.setInterval(refreshCount, POLL_MS);
    window.addEventListener("focus", refreshCount);
    return () => {
      window.clearInterval(interval);
      window.removeEventListener("focus", refreshCount);
    };
  }, [refreshCount]);

  // Load the recent list when the dropdown opens.
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoading(true);
    api
      .listNotifications({ limit: DROPDOWN_LIMIT })
      .then((page) => {
        if (cancelled) return;
        setItems(page.items);
      })
      .catch(() => {
        // chrome only — keep whatever was last shown
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open]);

  async function onRowClick(n: NotificationDto) {
    setOpen(false);
    // Optimistically clear it locally, then persist + navigate.
    if (!n.readAt) {
      setItems((prev) => prev.map((x) => (x.id === n.id ? { ...x, readAt: new Date().toISOString() } : x)));
      setUnread((c) => Math.max(0, c - 1));
      api.markNotificationRead(n.id).catch(() => refreshCount());
    }
    const link = typeof n.data?.link === "string" ? n.data.link : null;
    if (link) router.push(link);
  }

  async function onMarkAll() {
    setItems((prev) => prev.map((x) => (x.readAt ? x : { ...x, readAt: new Date().toISOString() })));
    setUnread(0);
    try {
      await api.markAllNotificationsRead();
    } catch {
      refreshCount();
    }
  }

  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger asChild>
        <button
          type="button"
          aria-label={unread > 0 ? `Notifications, ${unread} unread` : "Notifications"}
          className={cn(
            "relative inline-flex h-8 w-8 items-center justify-center rounded-md border border-line bg-surface text-muted transition",
            "hover:bg-subtle hover:text-ink",
            "data-[state=open]:bg-subtle data-[state=open]:text-ink",
          )}
        >
          <BellIcon className="h-4 w-4" />
          {unread > 0 && (
            <span
              className="absolute -right-1 -top-1 inline-flex min-w-4 items-center justify-center rounded-full bg-brand px-1 text-[10px] font-semibold leading-4 text-white"
              aria-hidden
            >
              {unread > 9 ? "9+" : unread}
            </span>
          )}
        </button>
      </Popover.Trigger>

      <Popover.Portal>
        <Popover.Content
          align="end"
          sideOffset={8}
          collisionPadding={8}
          aria-label="Notifications"
          className="z-40 w-80 overflow-hidden rounded-lg border border-line bg-surface shadow-lg outline-none motion-safe:animate-[popIn_140ms_ease-out]"
        >
          <div className="flex items-center justify-between border-b border-line px-3 py-2">
            <span className="text-sm font-semibold text-ink">Notifications</span>
            {unread > 0 && (
              <button
                type="button"
                onClick={onMarkAll}
                className="inline-flex items-center gap-1 rounded-sm text-label font-medium text-brand transition hover:opacity-80"
              >
                <CheckIcon className="h-3.5 w-3.5" />
                Mark all read
              </button>
            )}
          </div>

          <div className="max-h-96 overflow-y-auto">
            {loading && items.length === 0 ? (
              <p className="px-3 py-6 text-center text-sm text-muted">Loading…</p>
            ) : items.length === 0 ? (
              <div className="px-3 py-8 text-center">
                <p className="text-sm font-medium text-ink">You&rsquo;re all caught up</p>
                <p className="mt-1 text-label text-muted">New notifications will show up here.</p>
              </div>
            ) : (
              <ul>
                {items.map((n) => (
                  <li key={n.id}>
                    <button
                      type="button"
                      onClick={() => onRowClick(n)}
                      className={cn(
                        "flex w-full items-start gap-2 px-3 py-2.5 text-left transition hover:bg-subtle",
                        !n.readAt && "bg-brand-tint/40",
                      )}
                    >
                      <span
                        className={cn(
                          "mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full",
                          n.readAt ? "bg-transparent" : "bg-brand",
                        )}
                        aria-hidden
                      />
                      <span className="min-w-0 flex-1">
                        <span className="block text-sm font-medium text-ink">{n.title}</span>
                        <span className="block truncate text-label text-muted">{n.body}</span>
                        <span className="mt-0.5 block text-label text-muted">{timeAgo(n.createdAt)}</span>
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
