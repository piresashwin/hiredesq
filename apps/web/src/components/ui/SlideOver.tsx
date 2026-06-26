"use client";

import { type ReactNode } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { cn } from "@/lib/cn";
import { CloseIcon } from "@/components/ui/Icon";

// Right-edge slide-over panel for the candidate profile (design-system §6.4) —
// preferred over full navigation so the recruiter keeps her place in the list.
// Built on Radix Dialog (the project's behaviour-primitive layer): focus trap +
// restore, Esc, scroll-lock, aria-modal, scrim dismissal. The visible header is the
// caller's (SlideOverHeader); a visually-hidden Dialog.Title carries the accessible
// name Radix requires. Transition respects prefers-reduced-motion via motion-reduce.

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
  return (
    <Dialog.Root
      open={open}
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
    >
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-ink/30 motion-safe:animate-[fade_140ms_ease-out]" />
        <Dialog.Content
          className={cn(
            "fixed right-0 top-0 z-50 flex h-full w-full flex-col bg-surface shadow-lg outline-none",
            // `xl` (candidate profile): ~10% wider than the old max-w-4xl (896px → 986px).
            size === "xl" ? "max-w-[986px]" : "max-w-md",
            "motion-safe:animate-[slideIn_160ms_ease-out]",
          )}
        >
          {/* The visible title lives in the caller's header; this is the accessible
              name Radix needs (sr-only keeps the layout identical to before). */}
          <Dialog.Title className="sr-only">{title}</Dialog.Title>
          {children}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
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
