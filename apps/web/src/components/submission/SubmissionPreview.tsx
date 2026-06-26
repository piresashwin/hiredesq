"use client";

import { useEffect, useState } from "react";
import type { SubmissionDto } from "@hiredesq/shared";
import { useToast } from "@/components/ui/Toast";
import { SlideOver, SlideOverHeader } from "@/components/ui/SlideOver";
import { Button } from "@/components/ui/Button";
import { SubmissionBadge } from "@/components/ui/Badge";
import { CheckIcon, LinkIcon, PrinterIcon } from "@/components/ui/Icon";
import { MaskedProfileView } from "@/components/submission/MaskedProfileView";
import { VerdictControl } from "@/components/submission/VerdictControl";

// Preview of a freshly generated client-ready submission (§2D, Wedge 2). Shown in
// the recruiter's slide-over after generation: the masked profile + AI prose, with
// the two outbound actions a recruiter actually needs — copy the public share link
// and print/export the artifact. The masked DTO has no contact fields, so there's
// nothing to leak here (CLAUDE.md §2).

/** The public client-facing URL for a submission's share token. */
export function shareUrl(token: string): string {
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  return `${origin}/shared/submissions/${token}`;
}

export function SubmissionPreview({
  submission,
  open,
  onClose,
  onUpdated,
}: {
  submission: SubmissionDto | null;
  open: boolean;
  onClose: () => void;
  /** Fires when a verdict is recorded so the surrounding list / pipeline can refresh. */
  onUpdated?: (updated: SubmissionDto) => void;
}) {
  const { toast } = useToast();
  const [copied, setCopied] = useState(false);
  // Local copy so the status badge + verdict control update the moment a verdict is
  // recorded, without waiting on the parent to re-feed the prop.
  const [current, setCurrent] = useState<SubmissionDto | null>(submission);

  useEffect(() => {
    setCurrent(submission);
  }, [submission]);

  if (!current) return null;

  const url = shareUrl(current.shareToken);

  async function onCopy() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      toast("Share link copied — send it to your client.", "success");
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      toast("Couldn't copy automatically — the link is selected below.", "error");
    }
  }

  function onPrint() {
    // The public share page is the print-ready artifact — open it and let the
    // client/recruiter print or save-to-PDF from there (no contact data on it).
    window.open(url, "_blank", "noopener,noreferrer");
  }

  return (
    <SlideOver
      open={open}
      onClose={onClose}
      title={`Client-ready submission for ${current.maskedProfile.fullName}`}
    >
      <SlideOverHeader onClose={onClose}>
        <div className="flex items-center gap-2">
          <h2 className="text-h2 text-ink">Client-ready submission</h2>
          <SubmissionBadge status={current.status} />
        </div>
        <p className="mt-0.5 text-sm text-muted">
          Contact-masked and branded — ready to send to your client.
        </p>
      </SlideOverHeader>

      <div className="flex-1 overflow-y-auto px-4 py-5 sm:px-5">
        <MaskedProfileView profile={current.maskedProfile} summary={current.summary} />
      </div>

      {/* Client-feedback loop (F5): relay the client's verdict once the submission is
          out. Sits above the outbound actions as the natural next step. */}
      <div className="border-t border-line p-4 sm:px-5">
        <VerdictControl
          submission={current}
          onRecorded={(updated) => {
            setCurrent(updated);
            onUpdated?.(updated);
          }}
        />
      </div>

      {/* Outbound actions — copy the public link, or open the print-ready view. */}
      <div className="border-t border-line p-4 sm:px-5">
        <div className="flex items-center gap-2 rounded-md border border-line bg-subtle/50 px-2.5 py-1.5">
          <LinkIcon className="h-4 w-4 shrink-0 text-muted" aria-hidden />
          <input
            type="text"
            readOnly
            value={url}
            aria-label="Public share link"
            onFocus={(e) => e.currentTarget.select()}
            className="min-w-0 flex-1 truncate bg-transparent text-sm text-muted outline-none"
          />
        </div>
        <div className="mt-3 flex gap-2">
          <Button variant="primary" size="md" onClick={() => void onCopy()} className="flex-1">
            {copied ? <CheckIcon className="h-4 w-4" /> : <LinkIcon className="h-4 w-4" />}
            {copied ? "Copied" : "Copy share link"}
          </Button>
          <Button variant="secondary" size="md" onClick={onPrint}>
            <PrinterIcon className="h-4 w-4" />
            Export / Print
          </Button>
        </div>
      </div>
    </SlideOver>
  );
}
