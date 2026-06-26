"use client";

import { type ReactNode } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { cn } from "@/lib/cn";

// Centered modal — reserved for destructive confirms (PII delete) and placement
// capture (design-system §6.8). Built on Radix Dialog (the project's behaviour-
// primitive layer): focus trap + focus restore, Esc, scroll-lock, aria-modal, and
// title/description wiring come from Radix; the look is 100% our own tokens. The
// public API (open/onClose/title/description/tone/size) is unchanged. Everything
// lower-stakes uses slide-overs / inline edits.

export function Modal({
  open,
  onClose,
  title,
  description,
  children,
  tone = "default",
  size = "md",
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: ReactNode;
  children?: ReactNode;
  tone?: "default" | "danger";
  /** `md` (default) for confirms; `lg` for the multi-column step forms. */
  size?: "md" | "lg";
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
        {/* Full-screen layer for placement (bottom-sheet on mobile, centered on
            desktop). pointer-events-none so a click on the empty area falls through
            to the Overlay → Radix dismisses via interact-outside. */}
        <div className="pointer-events-none fixed inset-0 z-50 flex items-end justify-center p-0 sm:items-center sm:p-4">
          <Dialog.Content
            className={cn(
              "pointer-events-auto relative w-full rounded-t-lg bg-surface p-5 shadow-lg outline-none sm:rounded-lg",
              size === "lg" ? "max-w-2xl" : "max-w-md",
              "motion-safe:animate-[popIn_140ms_ease-out]",
            )}
          >
            <Dialog.Title
              className={cn("text-h3", tone === "danger" ? "text-danger" : "text-ink")}
            >
              {title}
            </Dialog.Title>
            {description ? (
              <Dialog.Description asChild>
                <div className="mt-2 text-body text-muted">{description}</div>
              </Dialog.Description>
            ) : null}
            <div className="mt-5">{children}</div>
          </Dialog.Content>
        </div>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
