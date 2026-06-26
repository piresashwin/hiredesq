import { Prisma } from "@hiredesq/database";
import type { PipelineStage } from "@hiredesq/shared";
import { STAGE_PROBABILITY } from "@hiredesq/shared";
import { Money } from "@hiredesq/core";

// Stages that count toward in-flight pipeline value. `placed` is booked revenue
// (counted in the revenue flow, not pipeline) and `rejected` is dead — both
// carry probability 0, but we exclude them explicitly so the intent is clear.
const IN_FLIGHT: PipelineStage[] = ["sourced", "submitted", "interview"];

/**
 * Weighted pipeline value for a job (CLAUDE.md §3 — Decimal via the Money value
 * object, never JS float). For each in-flight application:
 *
 *   contribution = expectedFee × STAGE_PROBABILITY[stage]
 *
 * summed and rounded to the currency's minor unit, serialized to a money string.
 * A null expectedFee yields "0.00". Pure (no Prisma) so it's unit-testable.
 */
export function computePipelineValue(
  expectedFee: Prisma.Decimal | null,
  stageCounts: Partial<Record<PipelineStage, number>>,
  currency: string,
): string {
  if (expectedFee === null) return fixed2(Money.zero(currency));

  const fee = Money.of(expectedFee.toString(), currency);
  let total = Money.zero(currency);
  for (const stage of IN_FLIGHT) {
    const count = stageCounts[stage] ?? 0;
    if (count === 0) continue;
    // fee × probability × count of apps in this stage.
    total = total.add(fee.times(STAGE_PROBABILITY[stage]).times(count));
  }
  return fixed2(total);
}

// Money.toString() drops trailing zeros; a money string at the API boundary is
// always padded to the currency's 2 minor digits ("0.00", "1000.00").
function fixed2(money: Money): string {
  return new Prisma.Decimal(money.round().toString()).toFixed(2);
}
