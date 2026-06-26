import { Type } from "class-transformer";
import { IsInt, IsOptional, Max, Min } from "class-validator";
import type { Paginated, PageQueryInput } from "@hiredesq/shared";

/**
 * Bounded, offset-paged list endpoints. No list query may run an unbounded
 * `findMany` — that table-scans and grows without limit as a workspace ingests.
 * Every list takes a validated `page`/`limit` and returns a `Paginated<T>`
 * envelope ({ items, total, page, limit }) so the client can render a numbered
 * pager + "X–Y of N" (Batch C — the offset-paging follow-up to the Batch B hard
 * bound). `pageTake` → Prisma `take`, `pageSkip` → Prisma `skip`, both clamped.
 */
// Server default when a caller omits `limit` (kept generous so existing
// non-paginated internal callers are unaffected). The paginated web tables send
// an explicit `limit` (their visible page size), so this is only a safety bound.
export const DEFAULT_PAGE_SIZE = 100;
export const MAX_PAGE_SIZE = 200;

export class PaginationQuery implements PageQueryInput {
  // Query params arrive as strings; @Type coerces to a number for @IsInt/@Min/@Max.
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(MAX_PAGE_SIZE)
  limit?: number;
}

/** Resolve a validated `limit` to a safe Prisma `take` (default + hard ceiling). */
export function pageTake(query?: { limit?: number }): number {
  const n = query?.limit ?? DEFAULT_PAGE_SIZE;
  return Math.min(Math.max(1, Math.floor(n)), MAX_PAGE_SIZE);
}

/** Resolve a validated 1-based `page` (+ `limit`) to a Prisma `skip` offset. */
export function pageSkip(query?: { page?: number; limit?: number }): number {
  const page = Math.max(1, Math.floor(query?.page ?? 1));
  return (page - 1) * pageTake(query);
}

/** The 1-based page number a query resolves to (clamped to ≥ 1). */
export function pageNumber(query?: { page?: number }): number {
  return Math.max(1, Math.floor(query?.page ?? 1));
}

/** Build the `Paginated<T>` envelope from a fetched slice + total count. */
export function buildPage<T>(
  items: T[],
  total: number,
  query?: { page?: number; limit?: number },
): Paginated<T> {
  return { items, total, page: pageNumber(query), limit: pageTake(query) };
}
