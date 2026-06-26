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
    /** The pg-boss job id, when known (diagnostics only). */
    jobId?: string;
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
      // "12 added · 1 duplicate · 0 failed of 13" — ids/counts only (§2).
      const dup = `${p.duplicates} ${p.duplicates === 1 ? "duplicate" : "duplicates"}`;
      return {
        type,
        title: "Bulk import complete",
        body: `${p.done} added · ${dup} · ${p.failed} failed of ${p.total}`,
        data: {
          // Open the candidates pool filtered to this drop.
          link: `/candidates?batch=${encodeURIComponent(p.batchId)}`,
          batchId: p.batchId,
          total: p.total,
          done: p.done,
          duplicates: p.duplicates,
          failed: p.failed,
          ...(p.jobId !== undefined ? { jobId: p.jobId } : {}),
        },
      };
    }
    // No default: a new NotificationType without a case is a compile error here.
  }
  // Unreachable — the switch is exhaustive over NotificationType.
  throw new Error(`unhandled notification type: ${type as string}`);
}
