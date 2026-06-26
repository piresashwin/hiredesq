"use client";

import { useRef, type ReactNode } from "react";
import { cn } from "@/lib/cn";
import { useFocusTrap } from "@/lib/useFocusTrap";
import { CloseIcon } from "@/components/ui/Icon";

// Right-edge slide-over panel for the candidate profile (design-system §6.4) —
// preferred over full navigation so the recruiter keeps her place in the list.
// Hand-rolled a11y: role=dialog, focus trap, Esc to close, scrim click to close.
// Transition respects prefers-reduced-motion via motion-reduce: utilities.

export function SlideOver({
  open,
  onClose,
  title,
  children,
  size = "md",
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  /** `md` (default) for the standard profile panel; `xl` for the wide two-column
   *  layout (candidate profile). */
  size?: "md" | "xl";
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  useFocusTrap(panelRef, open, onClose);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50" aria-hidden={false}>
      {/* Scrim */}
      <button
        type="button"
        aria-label="Close panel"
        onClick={onClose}
        className="absolute inset-0 bg-ink/30 motion-safe:animate-[fade_140ms_ease-out]"
        tabIndex={-1}
      />
      {/* Panel */}
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        className={cn(
          "absolute right-0 top-0 flex h-full w-full flex-col bg-surface shadow-lg outline-none",
          // `xl` (candidate profile): ~10% wider than the old max-w-4xl (896px → 986px).
          size === "xl" ? "max-w-[986px]" : "max-w-md",
          "motion-safe:animate-[slideIn_160ms_ease-out]",
        )}
      >
        {children}
      </div>
    </div>
  );
}

/** Sticky header row for a SlideOver, with a close affordance. */
export function SlideOverHeader({
  onClose,
  children,
}: {
  onClose: () => void;
  children: ReactNode;
}) {
  return (
    <div className="flex items-start justify-between gap-3 border-b border-line p-4 sm:p-5">
      <div className="min-w-0">{children}</div>
      <button
        type="button"
        onClick={onClose}
        aria-label="Close"
        className="-mr-1 -mt-1 shrink-0 rounded-md p-1.5 text-muted transition hover:bg-subtle hover:text-ink"
      >
        <CloseIcon className="h-5 w-5" />
      </button>
    </div>
  );
}
