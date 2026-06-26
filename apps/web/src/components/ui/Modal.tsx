"use client";

import { useRef, type ReactNode } from "react";
import { cn } from "@/lib/cn";
import { useFocusTrap } from "@/lib/useFocusTrap";

// Centered modal — reserved for destructive confirms (PII delete) and placement
// capture (design-system §6.8). Hand-rolled a11y: role=dialog, focus trap, Esc,
// labelled by its title. Everything lower-stakes uses slide-overs / inline edits.

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
  const ref = useRef<HTMLDivElement>(null);
  useFocusTrap(ref, open, onClose);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center p-0 sm:items-center sm:p-4">
      <button
        type="button"
        aria-label="Close dialog"
        onClick={onClose}
        tabIndex={-1}
        className="absolute inset-0 bg-ink/30 motion-safe:animate-[fade_140ms_ease-out]"
      />
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-labelledby="modal-title"
        tabIndex={-1}
        className={cn(
          "relative w-full rounded-t-lg bg-surface p-5 shadow-lg outline-none sm:rounded-lg",
          size === "lg" ? "max-w-2xl" : "max-w-md",
          "motion-safe:animate-[popIn_140ms_ease-out]",
        )}
      >
        <h2
          id="modal-title"
          className={cn("text-h3", tone === "danger" ? "text-danger" : "text-ink")}
        >
          {title}
        </h2>
        {description ? <div className="mt-2 text-body text-muted">{description}</div> : null}
        <div className="mt-5">{children}</div>
      </div>
    </div>
  );
}
