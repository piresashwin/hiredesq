import { IsIn, IsOptional } from "class-validator";
import type { ResolveDuplicateInput } from "@hiredesq/shared";
import { PaginationQuery } from "../../common/pagination.js";

type DuplicateStatus = "pending" | "confirmed" | "dismissed";
const STATUSES: DuplicateStatus[] = ["pending", "confirmed", "dismissed"];

// ?status filter for the review list (defaults to pending in the service).
// Extends PaginationQuery for the bounded `limit` (Batch B).
export class ListDuplicatesQuery extends PaginationQuery {
  @IsOptional()
  @IsIn(STATUSES)
  status?: DuplicateStatus;
}

// confirm = merge the new record into the existing one; dismiss = keep both.
export class ResolveDuplicateDto implements ResolveDuplicateInput {
  @IsIn(["confirm", "dismiss"])
  action!: "confirm" | "dismiss";
}
