"use client";

import { usePathname } from "next/navigation";
import { HelpIcon } from "@/components/ui/Icon";
import { useTour } from "@/lib/tour";
import { screenForPath } from "@/lib/tours";

// The per-screen "start tour" affordance in the top bar. Resolves the current
// route to its tour; renders nothing on screens without one. Shows a small
// terracotta dot until the user has taken this screen's tour once (the "unseen"
// cue). Tagged data-tour="tour-launcher" so a tour's final step can point back
// to it ("replay anytime").
export function TourButton() {
  const pathname = usePathname();
  const { startTour, hasSeen } = useTour();
  const screen = screenForPath(pathname);

  if (!screen) return null;

  const unseen = !hasSeen(screen);

  return (
    <button
      type="button"
      data-tour="tour-launcher"
      onClick={() => startTour(screen)}
      aria-label="Start guided tour for this screen"
      title="Take a quick tour"
      className="relative inline-flex h-8 w-8 items-center justify-center rounded-md text-muted transition hover:bg-subtle hover:text-ink"
    >
      <HelpIcon className="h-5 w-5" />
      {unseen ? (
        <span
          aria-hidden
          className="absolute right-1.5 top-1.5 h-1.5 w-1.5 rounded-full bg-accent ring-2 ring-surface"
        />
      ) : null}
    </button>
  );
}
