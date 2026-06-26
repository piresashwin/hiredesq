import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

// Shared body-layout primitives (design-system §5 — "breezy frame, dense data").
// They own the page's *frame* rhythm in ONE place so it can't drift screen to
// screen: gutters, vertical padding, the max-width cap, and the gap between major
// blocks. Data stays dense inside them (40px rows, chips, kanban cards) — these
// only space the containers, never the data.

// PageBody — the standard content wrapper under a PageHeader. Caps + centers at
// max-w-screen-2xl and applies the page gutter + vertical padding. `flex-1` lets
// it fill a `flex h-full flex-col` page (e.g. Candidates); it's inert otherwise.
export function PageBody({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "mx-auto w-full max-w-screen-2xl flex-1 px-4 py-6 sm:px-6 sm:py-8 lg:px-8",
        className,
      )}
    >
      {children}
    </div>
  );
}

// Section — stacks major blocks within a PageBody with the standard section gap
// (32px). Use it instead of re-typing `space-y-8` per page.
export function Section({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return <div className={cn("space-y-8", className)}>{children}</div>;
}
