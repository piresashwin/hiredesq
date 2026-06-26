import { Prisma } from "@hiredesq/database";
import { Money } from "@hiredesq/core";
import type { CreatePlacementInput } from "@hiredesq/shared";

/**
 * Resolve a placement fee to a Decimal money string via the Money value object —
 * never JS float (CLAUDE.md §3). Pure (no Prisma I/O) so it's unit-testable:
 *
 *   flat              → Money.of(amount, currency)
 *   percent_of_salary → Money.percentOf(Money.of(salary, currency), percent)
 *
 * The result is rounded half-up to 2dp and serialized as a fixed 2-decimal string
 * ("12000.00"), the exact value stored in Placement.feeAmount. Storing the
 * resolved Decimal (not the inputs) is what lets the revenue dashboard reconcile
 * EXACTLY with the placement rows: Σ feeAmount == the hero number.
 *
 * Throws FeeResolutionError when the inputs required by the basis are missing
 * (flat needs amount; percent_of_salary needs salary + percent) — the caller maps
 * that to a 400.
 */
export class FeeResolutionError extends Error {}

export function resolveFee(
  input: Pick<CreatePlacementInput, "basis" | "currency" | "amount" | "salary" | "percent">,
): string {
  const { basis, currency } = input;

  let fee: Money;
  if (basis === "flat") {
    if (input.amount === undefined) {
      throw new FeeResolutionError("a flat fee requires `amount`");
    }
    fee = Money.of(input.amount, currency);
  } else {
    // percent_of_salary
    if (input.salary === undefined || input.percent === undefined) {
      throw new FeeResolutionError("a percent_of_salary fee requires `salary` and `percent`");
    }
    fee = Money.percentOf(Money.of(input.salary, currency), input.percent);
  }

  // Round half-up to the currency's 2 minor digits, then pad to a fixed 2dp string
  // for the Decimal(14,2) column (Money.toString() drops trailing zeros).
  return new Prisma.Decimal(fee.round().toString()).toFixed(2);
}
