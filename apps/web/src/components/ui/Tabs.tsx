"use client";

import { useId, useRef, type ReactNode } from "react";
import { cn } from "@/lib/cn";

// Accessible underline tabs (design-system §6). role=tablist/tab/tabpanel with
// roving tabindex + arrow/Home/End key nav. Controlled: the parent owns `value`.
// Renders the tablist (sticky-friendly, scrolls horizontally on overflow) plus the
// active panel via a render function, so the a11y id wiring stays internal.

export interface TabDef {
  key: string;
  label: ReactNode;
  /** Optional count pill (e.g. number of submissions). */
  count?: number;
}

export function Tabs({
  tabs,
  value,
  onChange,
  children,
  className,
  variant = "underline",
}: {
  tabs: TabDef[];
  value: string;
  onChange: (key: string) => void;
  /** Render the active panel's content. */
  children: (active: string) => ReactNode;
  className?: string;
  /**
   * "underline" (default) — full-width strip with a bottom border, for in-page
   * section navigation. "pill" — a compact segmented control, for settings-style
   * tabs whose panels flow with the page rather than scrolling inside a flex fill.
   */
  variant?: "underline" | "pill";
}) {
  const pill = variant === "pill";
  const baseId = useId();
  const refs = useRef<Record<string, HTMLButtonElement | null>>({});
  const index = Math.max(0, tabs.findIndex((t) => t.key === value));

  function focusTab(i: number) {
    const t = tabs[(i + tabs.length) % tabs.length];
    if (!t) return;
    onChange(t.key);
    refs.current[t.key]?.focus();
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === "ArrowRight") {
      e.preventDefault();
      focusTab(index + 1);
    } else if (e.key === "ArrowLeft") {
      e.preventDefault();
      focusTab(index - 1);
    } else if (e.key === "Home") {
      e.preventDefault();
      focusTab(0);
    } else if (e.key === "End") {
      e.preventDefault();
      focusTab(tabs.length - 1);
    }
  }

  return (
    <div className={cn("flex min-h-0 flex-col", className)}>
      <div
        role="tablist"
        aria-orientation="horizontal"
        onKeyDown={onKeyDown}
        className={cn(
          "flex shrink-0",
          pill
            ? "inline-flex gap-0.5 self-start rounded-md border border-line bg-surface p-0.5"
            // overflow-y-hidden is load-bearing: setting only overflow-x:auto makes
            // the browser compute overflow-y as `auto` too, which shows a stray
            // vertical scrollbar on the tab strip.
            : "gap-1 overflow-x-auto overflow-y-hidden border-b border-line",
        )}
      >
        {tabs.map((t) => {
          const selected = t.key === value;
          return (
            <button
              key={t.key}
              ref={(el) => {
                refs.current[t.key] = el;
              }}
              type="button"
              role="tab"
              id={`${baseId}-tab-${t.key}`}
              aria-selected={selected}
              aria-controls={`${baseId}-panel-${t.key}`}
              tabIndex={selected ? 0 : -1}
              onClick={() => onChange(t.key)}
              className={cn(
                "relative flex items-center gap-1.5 whitespace-nowrap text-body font-medium transition",
                "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-brand",
                pill
                  ? cn(
                      "rounded-sm px-4 py-1.5",
                      selected ? "bg-brand-tint text-brand" : "text-muted hover:text-ink",
                    )
                  : cn(
                      "-mb-px border-b-2 px-3 py-4",
                      selected
                        ? "border-brand text-ink"
                        : "border-transparent text-muted hover:text-ink",
                    ),
              )}
            >
              {t.label}
              {typeof t.count === "number" ? (
                <span
                  className={cn(
                    "nums rounded-full px-1.5 text-label tabular-nums",
                    selected ? "bg-brand-tint text-brand" : "bg-subtle text-muted",
                  )}
                >
                  {t.count}
                </span>
              ) : null}
            </button>
          );
        })}
      </div>
      <div
        role="tabpanel"
        id={`${baseId}-panel-${value}`}
        aria-labelledby={`${baseId}-tab-${value}`}
        tabIndex={0}
        className={cn(
          "focus-visible:outline-none",
          pill ? "mt-5" : "min-h-0 flex-1 overflow-y-auto",
        )}
      >
        {children(value)}
      </div>
    </div>
  );
}
