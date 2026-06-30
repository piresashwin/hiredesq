// Pure notification copy/payload builder — NO Prisma, NO Nest, NO side effects.
// Both the API (NotificationsService.emit) and the worker (the bulk-complete
// trigger) call this so they produce the BYTE-IDENTICAL { type, title, body, data }
// shape (CLAUDE.md "one contract, both sides"). Adding a NotificationType means
// adding a params entry + a case here, and both sides recompile against it.
//
// Copy only renders ids/counts — never PII (§2).

import type { NotificationData, NotificationType } from "./contracts.js";

/** The per-type parameter shape the builder needs to render copy + payload. */
export interface NotificationParams {
  bulk_import_complete: {
    /** The ImportBatch this fired for — the link target + payload id. */
    batchId: string;
    /** Total items in the drop. */
    total: number;
    /** Items added as new candidates. */
    done: number;
    /** Items skipped as duplicates of an existing candidate. */
    duplicates: number;
    /** Items that failed to parse. */
    failed: number;
    /**
     * True when the batch was auto-sealed by the delayed safety net (the client died
     * before sending the final chunk) — some files may not have finished uploading.
     * A flag only (§2 — no PII / filenames).
     */
    partial?: boolean;
    /** The pg-boss job id, when known (diagnostics only). */
    jobId?: string;
  };
  ingest_limit_approaching: {
    /** Parses used in the current period (the crossing count). */
    used: number;
    /** The ingest ceiling for the workspace's plan. */
    limit: number;
    /** Whether the ceiling is a permanent ("lifetime", free) or resetting
     * ("monthly", solo_pro) one — drives the framing, not PII. */
    period: "lifetime" | "monthly";
  };
}

/** The rendered, persistable notification shape (sans id/workspace/recipient). */
export interface BuiltNotification {
  type: NotificationType;
  title: string;
  body: string;
  data: NotificationData;
}

/**
 * Render the title/body/data for a notification of `type` from its params. Pure:
 * the same input always yields the same output, with no I/O — safe to call inside
 * the worker's exactly-once batch-completion transaction and the API service alike.
 */
export function buildNotification<T extends NotificationType>(
  type: T,
  params: NotificationParams[T],
): BuiltNotification {
  switch (type) {
    case "bulk_import_complete": {
      const p = params as NotificationParams["bulk_import_complete"];
      // "12 added · 1 duplicate · 0 failed of 13" — ids/counts only (§2). When the drop
      // was auto-sealed (partial), warn that some files may not have finished uploading;
      // the title/body carry only counts + a system flag, never PII / filenames (§2).
      const dup = `${p.duplicates} ${p.duplicates === 1 ? "duplicate" : "duplicates"}`;
      const summary = `${p.done} added · ${dup} · ${p.failed} failed of ${p.total}`;
      return {
        type,
        title: p.partial ? "Bulk import finished (partial)" : "Bulk import complete",
        body: p.partial
          ? `${summary} — some files may not have finished uploading`
          : summary,
        data: {
          // Open the candidates pool filtered to this drop.
          link: `/candidates?batch=${encodeURIComponent(p.batchId)}`,
          batchId: p.batchId,
          total: p.total,
          done: p.done,
          duplicates: p.duplicates,
          failed: p.failed,
          partial: p.partial ?? false,
          ...(p.jobId !== undefined ? { jobId: p.jobId } : {}),
        },
      };
    }
    case "ingest_limit_approaching": {
      const p = params as NotificationParams["ingest_limit_approaching"];
      // Celebratory, counts-only — a milestone, not a scold (§2 — no PII). Framing
      // differs by period: the free "lifetime" ceiling is a permanent wall to grow
      // past; the solo_pro "monthly" ceiling resets, so it's a busy-month signal.
      const lifetime = p.period === "lifetime";
      return {
        type,
        title: lifetime ? "Your database is growing 🎉" : "Busy month 🎉",
        body: lifetime
          ? `You've parsed ${p.used} of ${p.limit} free candidates — upgrade to keep building without limits.`
          : `You've used ${p.used} of ${p.limit} parses this month — go unmetered with a bigger plan.`,
        data: {
          // Land on the plan/upgrade screen.
          link: "/settings/billing",
          used: p.used,
          limit: p.limit,
          period: p.period,
        },
      };
    }
    // No default: a new NotificationType without a case is a compile error here.
  }
  // Unreachable — the switch is exhaustive over NotificationType.
  throw new Error(`unhandled notification type: ${type as string}`);
}
