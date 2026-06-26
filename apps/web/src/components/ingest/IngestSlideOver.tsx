"use client";

import { useState } from "react";
import { useIngest } from "@/lib/ingest-context";
import { SlideOver, SlideOverHeader } from "@/components/ui/SlideOver";
import { IngestSurface } from "@/components/ingest/IngestSurface";
import { DuplicateReviewSlideOver } from "@/components/ingest/DuplicateReview";

// The persistent "+ Add candidates" surface, opened from the top bar anywhere in
// the app (design-system §5 — ingest is never more than one click away). Renders
// the same IngestSurface used by the candidates empty-state. After a bulk import
// that finds possible duplicates, the surface can open the dedup-review panel.
export function IngestSlideOver() {
  const { open, closeIngest } = useIngest();
  const [reviewOpen, setReviewOpen] = useState(false);

  return (
    <>
      <SlideOver open={open} onClose={closeIngest} title="Add candidates">
        <SlideOverHeader onClose={closeIngest}>
          <h2 className="text-h2 text-ink">Add candidates</h2>
          <p className="mt-0.5 text-sm text-muted">
            Drop resumes, a folder, or a CSV — or paste anything messy. Watch it turn into clean
            candidates.
          </p>
        </SlideOverHeader>
        <div className="flex-1 overflow-y-auto p-4 sm:p-5">
          <IngestSurface
            variant="panel"
            autoFocus
            onReviewDuplicates={() => setReviewOpen(true)}
          />
        </div>
      </SlideOver>

      <DuplicateReviewSlideOver open={reviewOpen} onClose={() => setReviewOpen(false)} />
    </>
  );
}
