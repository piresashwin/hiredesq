"use client";

import { useCallback, useEffect, useState } from "react";
import type { InboxAddressDto } from "@hiredesq/shared";
import { cn } from "@/lib/cn";
import { api, ApiError } from "@/lib/api";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { useToast } from "@/components/ui/Toast";
import { CheckIcon, MailIcon, AlertIcon } from "@/components/ui/Icon";

// Forwarding inbox (F9, design-system settings). The workspace's email-ingest
// address: forward any CV or chat there and it lands PARSED in the pool — even
// when the recruiter isn't in the app. The address is a CAPABILITY (anyone who
// knows it can drop candidates into this workspace), so "Regenerate" is offered
// calmly for the leak case. The address is sensitive-ish but NOT PII — fine to
// display, never logged (CLAUDE.md §2). Live-backed by getInboxAddress().

export function InboxSettings() {
  const { toast } = useToast();
  const [inbox, setInbox] = useState<InboxAddressDto | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setInbox(await api.getInboxAddress());
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message
          : "We couldn't load your forwarding address. Please try again.",
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-line bg-canvas/95 px-4 py-4 backdrop-blur sm:px-6 lg:px-8">
        <h1 className="text-h1 text-ink">Forwarding inbox</h1>
        <p className="mt-0.5 text-sm text-muted">
          Forward a CV to your workspace and it lands parsed in your pool.
        </p>
      </div>

      <div className="mx-auto w-full max-w-3xl flex-1 space-y-8 px-4 py-6 sm:px-6 sm:py-8 lg:px-8">
        {loading ? (
          <InboxSkeleton />
        ) : error || !inbox ? (
          <ErrorState
            message={error ?? "We couldn't load your forwarding address. Please try again."}
            onRetry={() => void load()}
          />
        ) : (
          <InboxContent
            inbox={inbox}
            onRegenerated={(next) => {
              setInbox(next);
              toast("New forwarding address ready — the old one no longer works.", "success");
            }}
          />
        )}
      </div>
    </div>
  );
}

function InboxContent({
  inbox,
  onRegenerated,
}: {
  inbox: InboxAddressDto;
  onRegenerated: (next: InboxAddressDto) => void;
}) {
  const { toast } = useToast();
  const [copied, setCopied] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [regenerating, setRegenerating] = useState(false);

  const onCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(inbox.address);
      setCopied(true);
      toast("Forwarding address copied.", "success");
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      toast("Couldn't copy automatically — the address is selected above.", "error");
    }
  }, [inbox.address, toast]);

  const onRegenerate = useCallback(async () => {
    if (regenerating) return;
    setRegenerating(true);
    try {
      const next = await api.regenerateInboxAddress();
      onRegenerated(next);
      setConfirmOpen(false);
    } catch (err) {
      toast(
        err instanceof ApiError
          ? err.message
          : "Couldn't regenerate your address — please try again.",
        "error",
      );
    } finally {
      setRegenerating(false);
    }
  }, [regenerating, onRegenerated, toast]);

  return (
    <>
      <section className="rounded-lg border border-line bg-surface p-5" aria-label="Forwarding address">
        <div className="flex items-start gap-3">
          <span
            className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-brand-tint text-brand"
            aria-hidden
          >
            <MailIcon className="h-5 w-5" />
          </span>
          <div className="min-w-0">
            <h2 className="text-h3 text-ink">Your forwarding address</h2>
            <p className="mt-0.5 text-sm text-muted">
              Forward any CV or chat to this address and it lands parsed in your pool — even when
              you&apos;re not in the app. Attachments are read too, and plus-addressing to target a
              specific job is coming soon.
            </p>
          </div>
        </div>

        <label htmlFor="inbox-address" className="mt-4 block text-label text-muted">
          Forwarding address
        </label>
        <div className="mt-1.5 flex flex-col gap-2 sm:flex-row">
          <div className="flex min-w-0 flex-1 items-center gap-2 rounded-sm border border-line bg-subtle/50 px-3">
            <MailIcon className="h-4 w-4 shrink-0 text-muted" aria-hidden />
            <input
              id="inbox-address"
              type="text"
              readOnly
              value={inbox.address}
              onFocus={(e) => e.currentTarget.select()}
              className="nums min-w-0 flex-1 truncate bg-transparent py-2.5 text-body text-ink outline-none"
            />
          </div>
          <Button
            variant="primary"
            onClick={() => void onCopy()}
            className="shrink-0 sm:w-32"
            aria-label="Copy forwarding address"
          >
            {copied ? <CheckIcon className="h-4 w-4" /> : <MailIcon className="h-4 w-4" />}
            {copied ? "Copied" : "Copy"}
          </Button>
        </div>
      </section>

      {/* Regenerate — calm, cautionary. Reserved for the "it leaked" case. */}
      <section className="rounded-lg border border-line bg-surface p-5" aria-label="Regenerate address">
        <h2 className="text-h3 text-ink">Regenerate the address</h2>
        <p className="mt-1 text-sm text-muted">
          Anyone who knows this address can forward CVs into your workspace. If it ends up somewhere
          it shouldn&apos;t, regenerate it — you&apos;ll get a fresh address and the old one stops
          working immediately.
        </p>
        <Button
          variant="secondary"
          onClick={() => setConfirmOpen(true)}
          className="mt-4"
        >
          Regenerate address
        </Button>
      </section>

      <Modal
        open={confirmOpen}
        onClose={() => (regenerating ? undefined : setConfirmOpen(false))}
        title="Regenerate forwarding address?"
        description={
          <span className="flex items-start gap-2">
            <AlertIcon className="mt-0.5 h-4 w-4 shrink-0 text-warning" aria-hidden />
            <span>
              The current address will stop working right away. Any forwarding rules or saved
              contacts pointing at it will need the new address.
            </span>
          </span>
        }
      >
        <div className="flex justify-end gap-2">
          <Button
            variant="ghost"
            onClick={() => setConfirmOpen(false)}
            disabled={regenerating}
          >
            Keep current address
          </Button>
          <Button variant="primary" onClick={() => void onRegenerate()} disabled={regenerating}>
            {regenerating ? "Regenerating…" : "Regenerate"}
          </Button>
        </div>
      </Modal>
    </>
  );
}

// Skeleton matching the final shape (address card → regenerate card), never a
// centered spinner on a blank page (design-system §6.8, Principle 1).
function InboxSkeleton() {
  return (
    <div className="animate-pulse motion-reduce:animate-none" aria-hidden="true">
      <div className="rounded-lg border border-line bg-surface p-5">
        <div className="h-4 w-44 rounded-sm bg-subtle" />
        <div className="mt-2 h-3 w-full rounded-sm bg-subtle" />
        <div className="mt-1.5 h-3 w-2/3 rounded-sm bg-subtle" />
        <div className="mt-4 h-10 w-full rounded-sm bg-subtle" />
      </div>
      <div className="mt-8 h-32 rounded-lg border border-line bg-surface" />
    </div>
  );
}

function ErrorState({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="rounded-lg border border-line bg-surface py-12 text-center" role="alert">
      <p className="text-body text-ink">{message}</p>
      <button
        type="button"
        onClick={onRetry}
        className={cn(
          "mt-3 rounded-md border border-line px-3 py-1.5 text-body text-brand transition",
          "hover:bg-subtle",
        )}
      >
        Try again
      </button>
    </div>
  );
}
