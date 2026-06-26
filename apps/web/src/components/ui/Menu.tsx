"use client";

import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/cn";

// Hand-rolled accessible dropdown menu (no Radix / headless-ui — see task
// constraints). A trigger button opens a floating list of actions. A11y:
// button[aria-haspopup=menu][aria-expanded], role=menu + role=menuitem, roving
// arrow-key focus, Home/End, Esc to close (restores focus to the trigger),
// click-outside to dismiss.
//
// The panel renders in a PORTAL to <body> with FIXED positioning derived from the
// trigger's rect. This is deliberate: the menu is used inside tables, kanban
// columns, and sticky headers — all of which establish overflow/stacking
// contexts that would otherwise clip an absolutely-positioned child or stack it
// under a sibling. Portaling escapes those contexts entirely (the z-index bug).

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

interface Coords {
  top: number;
  left?: number;
  right?: number;
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
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const [coords, setCoords] = useState<Coords | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const itemRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const menuId = useId();

  const enabledIndexes = items.map((it, i) => (it.disabled ? -1 : i)).filter((i) => i >= 0);

  function openMenu(toIndex = enabledIndexes[0] ?? 0) {
    setActiveIndex(toIndex);
    setOpen(true);
  }

  function close(restoreFocus = true) {
    setOpen(false);
    if (restoreFocus) triggerRef.current?.focus();
  }

  // Position the floating panel against the trigger, flipping above when there
  // isn't room below. Recomputed on open and on scroll/resize so it tracks.
  const reposition = useCallback(() => {
    const r = triggerRef.current?.getBoundingClientRect();
    if (!r) return;
    const estHeight = Math.min(items.length * 38 + 12, 320);
    const below = window.innerHeight - r.bottom;
    const top = below < estHeight + 8 && r.top > estHeight ? r.top - estHeight - 4 : r.bottom + 4;
    setCoords(
      align === "end"
        ? { top, right: Math.max(8, window.innerWidth - r.right) }
        : { top, left: Math.max(8, r.left) },
    );
  }, [align, items.length]);

  useLayoutEffect(() => {
    if (open) reposition();
  }, [open, reposition]);

  // Track scroll (in any ancestor → capture) + resize while open.
  useEffect(() => {
    if (!open) return;
    const onMove = () => reposition();
    window.addEventListener("scroll", onMove, true);
    window.addEventListener("resize", onMove);
    return () => {
      window.removeEventListener("scroll", onMove, true);
      window.removeEventListener("resize", onMove);
    };
  }, [open, reposition]);

  // Focus the active item whenever it changes while open.
  useEffect(() => {
    if (open) itemRefs.current[activeIndex]?.focus();
  }, [open, activeIndex]);

  // Click outside closes (the panel is portaled, so check both trigger + panel).
  useEffect(() => {
    if (!open) return;
    function onPointer(e: PointerEvent) {
      const t = e.target as Node;
      if (!rootRef.current?.contains(t) && !menuRef.current?.contains(t)) setOpen(false);
    }
    document.addEventListener("pointerdown", onPointer, true);
    return () => document.removeEventListener("pointerdown", onPointer, true);
  }, [open]);

  function move(delta: number) {
    if (enabledIndexes.length === 0) return;
    const pos = enabledIndexes.indexOf(activeIndex);
    const nextPos = (pos + delta + enabledIndexes.length) % enabledIndexes.length;
    setActiveIndex(enabledIndexes[nextPos]!);
  }

  function onMenuKeyDown(e: React.KeyboardEvent) {
    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        move(1);
        break;
      case "ArrowUp":
        e.preventDefault();
        move(-1);
        break;
      case "Home":
        e.preventDefault();
        setActiveIndex(enabledIndexes[0] ?? 0);
        break;
      case "End":
        e.preventDefault();
        setActiveIndex(enabledIndexes[enabledIndexes.length - 1] ?? 0);
        break;
      case "Escape":
        e.preventDefault();
        e.stopPropagation();
        close();
        break;
      case "Tab":
        // Tabbing away dismisses the menu (no focus restore).
        setOpen(false);
        break;
    }
  }

  function onTriggerKeyDown(e: React.KeyboardEvent) {
    if (e.key === "ArrowDown" || e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      openMenu(enabledIndexes[0] ?? 0);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      openMenu(enabledIndexes[enabledIndexes.length - 1] ?? 0);
    }
  }

  return (
    <div ref={rootRef} className={cn("relative", className)}>
      <button
        ref={triggerRef}
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        aria-label={label}
        onClick={() => (open ? close() : openMenu())}
        onKeyDown={onTriggerKeyDown}
        className={cn(
          "inline-flex items-center justify-center rounded-sm text-muted transition",
          "hover:bg-subtle hover:text-ink",
          open && "bg-subtle text-ink",
        )}
      >
        {trigger}
      </button>

      {open && coords && typeof document !== "undefined"
        ? createPortal(
            <div
              ref={menuRef}
              id={menuId}
              role="menu"
              aria-label={label}
              onKeyDown={onMenuKeyDown}
              style={{ position: "fixed", top: coords.top, left: coords.left, right: coords.right }}
              className={cn(
                "z-50 min-w-[10rem] rounded-md border border-line bg-surface p-1 shadow-md",
                "motion-safe:animate-[popIn_120ms_ease-out]",
              )}
            >
              {items.map((item, i) => (
                <button
                  key={item.key}
                  ref={(el) => {
                    itemRefs.current[i] = el;
                  }}
                  type="button"
                  role="menuitem"
                  tabIndex={i === activeIndex ? 0 : -1}
                  disabled={item.disabled}
                  onClick={() => {
                    if (item.disabled) return;
                    close(false);
                    item.onSelect();
                  }}
                  onMouseEnter={() => !item.disabled && setActiveIndex(i)}
                  className={cn(
                    "flex w-full items-center gap-2 rounded-sm px-2.5 py-1.5 text-left text-body transition",
                    "disabled:cursor-not-allowed disabled:opacity-40",
                    item.destructive ? "text-danger hover:bg-danger-tint" : "text-ink hover:bg-subtle",
                  )}
                >
                  {item.icon ? <span className="shrink-0 text-muted">{item.icon}</span> : null}
                  <span className="truncate">{item.label}</span>
                </button>
              ))}
            </div>,
            document.body,
          )
        : null}
    </div>
  );
}
