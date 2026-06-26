"use client";

import { useCallback, useEffect, useState } from "react";
import type { SubmissionDto } from "@hiredesq/shared";
import { api, ApiError } from "@/lib/api";
import { timeAgo } from "@/lib/format";
import { useToast } from "@/components/ui/Toast";
import { SubmissionBadge } from "@/components/ui/Badge";
import { Menu, type MenuItem } from "@/components/ui/Menu";
import { EyeIcon, LinkIcon, MoreIcon, TrashIcon } from "@/components/ui/Icon";
import { SubmissionPreview, shareUrl } from "@/components/submission/SubmissionPreview";

// A lean list of past client-ready submissions for a candidate (§2D, Wedge 2).
// Shown under the generate action in the candidate profile; click one to re-open
// its preview (copy the link again, reprint). Stays quiet — degrades to nothing if
// the candidate has no submissions yet (the generate button above is the CTA).
//
// This is an EMBEDDED panel scoped to one candidate (api.listSubmissions(candidateId)),
// not a standalone top-level list — so it reads the paginated envelope's `.items`
// but doesn't render a numbered pager (a single candidate's submissions are few).

export function CandidateSubmissions({ candidateId }: { candidateId: string }) {
  const { toast } = useToast();
  const [submissions, setSubmissions] = useState<SubmissionDto[] | null>(null);
  const [selected, setSelected] = useState<SubmissionDto | null>(null);
  const [previewOpen, setPreviewOpen] = useState(false);

  const load = useCallback(
    (signal?: { cancelled: boolean }) => {
      // Scoped server-side to this candidate — no longer fetches every submission in
      // the workspace just to filter down to one candidate's (perf + payload). The
      // list endpoint is paginated; we read the envelope's items.
      api
        .listSubmissions(candidateId)
        .then((res) => {
          if (signal?.cancelled) return;
          setSubmissions(res.items);
        })
        .catch(() => {
          if (!signal?.cancelled) setSubmissions([]);
        });
    },
    [candidateId],
  );

  useEffect(() => {
    const signal = { cancelled: false };
    setSubmissions(null);
    load(signal);
    return () => {
      signal.cancelled = true;
    };
  }, [load]);

  const openPreview = useCallback((s: SubmissionDto) => {
    setSelected(s);
    setPreviewOpen(true);
  }, []);

  const copyShareLink = useCallback(
    async (s: SubmissionDto) => {
      try {
        await navigator.clipboard.writeText(shareUrl(s.shareToken));
        toast("Share link copied — send it to your client.", "success");
      } catch {
        toast("Couldn't copy the share link automatically.", "error");
      }
    },
    [toast],
  );

  const deleteSubmission = useCallback(
    async (s: SubmissionDto) => {
      if (!window.confirm("Delete this submission? The share link will stop working.")) return;
      try {
        await api.deleteSubmission(s.id);
        setSubmissions((prev) => (prev ? prev.filter((x) => x.id !== s.id) : prev));
        if (selected?.id === s.id) {
          setSelected(null);
          setPreviewOpen(false);
        }
        toast("Submission deleted.", "info");
      } catch (err) {
        toast(err instanceof ApiError ? err.message : "Couldn't delete this submission.", "error");
      }
    },
    [toast, selected],
  );

  // Nothing yet (or still loading) → stay quiet; the generate button is the CTA.
  if (!submissions || submissions.length === 0) return null;

  const rowMenu = (s: SubmissionDto): MenuItem[] => [
    { key: "open", label: "Open", icon: <EyeIcon className="h-4 w-4" />, onSelect: () => openPreview(s) },
    {
      key: "copy",
      label: "Copy share link",
      icon: <LinkIcon className="h-4 w-4" />,
      onSelect: () => void copyShareLink(s),
    },
    {
      key: "delete",
      label: "Delete",
      icon: <TrashIcon className="h-4 w-4" />,
      destructive: true,
      onSelect: () => void deleteSubmission(s),
    },
  ];

  return (
    <>
      <div className="mt-4">
        <h3 className="text-label uppercase text-muted">Submissions ({submissions.length})</h3>
        <ul className="mt-2 space-y-1.5">
          {submissions.map((s) => (
            <li key={s.id} className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => openPreview(s)}
                className="flex min-w-0 flex-1 items-center justify-between gap-2 rounded-md border border-line bg-surface px-3 py-2 text-left transition hover:bg-subtle"
              >
                <span className="min-w-0 truncate text-sm text-ink">
                  Sent {timeAgo(s.createdAt)}
                </span>
                <SubmissionBadge status={s.status} />
              </button>
              <Menu
                label="Submission actions"
                align="end"
                trigger={<MoreIcon className="h-5 w-5 p-0.5" />}
                items={rowMenu(s)}
              />
            </li>
          ))}
        </ul>
      </div>

      <SubmissionPreview
        submission={selected}
        open={previewOpen}
        onClose={() => setPreviewOpen(false)}
        onUpdated={(updated) => {
          // Keep the open preview's selection in sync, then refetch so the list's
          // status chip — and the auto-nudged pipeline/trail behind it — reflect
          // the recorded verdict.
          setSelected(updated);
          load();
        }}
      />
    </>
  );
}
