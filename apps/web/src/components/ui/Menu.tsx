"use client";

import { type ReactNode } from "react";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { cn } from "@/lib/cn";

// Accessible dropdown menu, built on Radix DropdownMenu (the project's behaviour-
// primitive layer, design-system §6). Radix owns the hard parts: roving arrow-key
// focus + typeahead, Home/End, Esc (restores focus to the trigger), click-outside
// dismissal, and Popper positioning in a PORTAL — which is what makes the menu
// escape the overflow/stacking contexts of tables, kanban columns, and sticky
// headers that used to clip or mis-stack it. We keep `modal={false}` so the menu
// doesn't scroll-lock the page while open inside those scrollable data views.
// The public API (label/trigger/items/align/className) is unchanged.

export interface MenuItem {
  key: string;
  label: ReactNode;
  onSelect: () => void;
  /** Renders in the danger token (e.g. Reject). */
  destructive?: boolean;
  /** Optional leading icon. */
  icon?: ReactNode;
  disabled?: boolean;
}

export function Menu({
  label,
  trigger,
  items,
  align = "end",
  className,
}: {
  /** Accessible name for the trigger (e.g. "Actions for Sarah Chen"). */
  label: string;
  /** The visual trigger contents (icon, text). */
  trigger: ReactNode;
  items: MenuItem[];
  align?: "start" | "end";
  className?: string;
}) {
  return (
    <DropdownMenu.Root modal={false}>
      <DropdownMenu.Trigger asChild>
        <button
          type="button"
          aria-label={label}
          className={cn(
            "inline-flex items-center justify-center rounded-sm text-muted transition",
            "hover:bg-subtle hover:text-ink",
            "data-[state=open]:bg-subtle data-[state=open]:text-ink",
            className,
          )}
        >
          {trigger}
        </button>
      </DropdownMenu.Trigger>

      <DropdownMenu.Portal>
        <DropdownMenu.Content
          align={align}
          sideOffset={4}
          collisionPadding={8}
          className={cn(
            "z-50 min-w-[10rem] rounded-md border border-line bg-surface p-1 shadow-md",
            "motion-safe:animate-[popIn_120ms_ease-out]",
          )}
        >
          {items.map((item) => (
            <DropdownMenu.Item
              key={item.key}
              disabled={item.disabled}
              onSelect={() => item.onSelect()}
              className={cn(
                "flex w-full cursor-pointer items-center gap-2 rounded-sm px-2.5 py-1.5 text-left text-body outline-none transition",
                "data-[disabled]:cursor-not-allowed data-[disabled]:opacity-40",
                // Radix drives the active row via data-[highlighted] (keyboard + hover).
                item.destructive
                  ? "text-danger data-[highlighted]:bg-danger-tint"
                  : "text-ink data-[highlighted]:bg-subtle",
              )}
            >
              {item.icon ? <span className="shrink-0 text-muted">{item.icon}</span> : null}
              <span className="truncate">{item.label}</span>
            </DropdownMenu.Item>
          ))}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}
