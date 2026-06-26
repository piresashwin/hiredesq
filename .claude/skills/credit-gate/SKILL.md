---
name: credit-gate
description: Wrap an AI/parse action in hiredesq's credit gate — check-and-reserve before the work, settle (commit) on success, refund on failure, atomic and workspace-scoped, idempotent under retries. Use when adding or changing any code path that calls the AI provider.
---

# Credit gating an AI action

Read `CLAUDE.md` §4. No provider call runs uncharged; no failed action is charged.

## The pattern

```
reserve(workspaceId, cost)        // atomic; throws InsufficientCreditsError if balance < cost
try:
    result = doWork()             // the AI/parse call
    commit(reservationId)         // finalize the charge
    return result
except:
    refund(reservationId)         // never charge for failed work
    raise
```

## Rules

1. **Reserve before work, settle after.** Never decrement only on success (free
   work slips through on failure) and never charge before the result exists.
2. **Atomic & no oversell.** Reservation is a single transaction or an idempotent
   ledger entry with a row lock / atomic decrement — concurrent parses for one
   workspace must not drive the balance negative. No plain read-modify-write.
3. **Refund on every failure path** — errors, timeouts, schema-validation failures.
4. **Idempotent — deterministic key.** Key the reservation by the *unit of work*:
   the parse content hash, or for a generation a stable `hash(workspaceId:
   candidateId:jobId)` / a client-supplied idempotency key. **Never a freshly
   random value** (a per-call `randomBytes` token, a new `shareToken`). A random
   key defeats the ledger's `@@unique([workspaceId, reservationKey])`, so a retry
   reserves and commits a *second* credit. The random artifact (e.g. a share token)
   is a separate field — don't reuse it as the reservation key.
5. **Free surfaces stay free.** Never wrap the clean DB, search, jobs list, or
   revenue view in a credit check (`CLAUDE.md` §4).
6. Paid tiers: high/unlimited balance — the gate still runs, it just doesn't deny.

## Two meters, one discipline

hiredesq has two gates and they often drift apart — hold both to this pattern:

- **Daily credit ledger** (`CreditAccount` aggregate) — gates submission generation.
  Reserve→commit/refund, row-locked, idempotent on key. This is the reference.
- **Ingest usage counter** ("Model B": a free-but-bounded lifetime count) — gates
  parsing. It is **pre-reserve**, mirroring the ledger (converted from the old
  meter-on-done damper, which let concurrent in-flight parses overshoot the cap):
  `reserveIngestSlot(workspaceId, contentHash)` does an atomic conditional update
  *before* the provider call (`UPDATE … SET ingest_used_lifetime =
  ingest_used_lifetime + 1 WHERE ingest_used_lifetime < limit`; zero rows ⇒
  `IngestQuotaError`) **and** claims the job's queued→processing transition in the
  same transaction, so it's idempotent per content hash (a retry of an already-
  claimed job reuses its slot, returns `metered=false`, never double-counts).
  `releaseIngestSlot(workspaceId)` decrements on every failure path; `markParseDone`
  finalizes the job without touching the counter. All three live in
  `apps/worker/src/parse.processor.ts`. A bare `findUnique` read of the counter
  followed by a later increment is the §4-banned read-modify-write — don't
  reintroduce it.

  **Invariant to preserve:** a slot is held only for live or successful work — every
  catch/early-return between `reserveIngestSlot` and `markParseDone` MUST release (a
  failed parse releases its slot, so it never consumes quota). Thread the `metered`
  flag `reserveIngestSlot` returns into the failure path so paid/reused calls don't
  decrement. Adding a new branch in a parse path without a matching release silently
  starts charging (consuming quota) for failures.

## Where it lives

The gate is the single entry point in front of `packages/ai`. The parse worker
(`apps/worker`) reserves on job pickup and settles on completion. A NestJS handler
that triggers a parse reserves synchronously, or enqueues a job that reserves.

## Verify

Run the `credit-metering-auditor` agent on the changed paths.

## Output

The gated call site(s) and the reserve/commit/refund ledger calls, with the
failure-path refund shown explicitly.
