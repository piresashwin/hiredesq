// Named import (not default): under NodeNext ESM the default import binds to the
// module namespace, which isn't constructable — decimal.mjs exports a named
// `Decimal` too, and the namespace merge keeps `Decimal.Value`/rounding types.
import { Decimal } from "decimal.js";

/** ISO 4217 code. Kept loose; validate against a supported set at the boundary. */
export type Currency = string;

/**
 * Money value object — amount + currency, with Decimal arithmetic and explicit
 * rounding. CLAUDE.md §3: money is never a JS `number`. Construct via the
 * factories; instances are immutable.
 */
export class Money {
  private constructor(
    private readonly amount: Decimal,
    readonly currency: Currency,
  ) {}

  static of(amount: Decimal.Value, currency: Currency): Money {
    return new Money(new Decimal(amount), currency);
  }

  static zero(currency: Currency): Money {
    return new Money(new Decimal(0), currency);
  }

  /** % of a base (e.g. a placement fee = 8.33% of annual salary). */
  static percentOf(base: Money, percent: Decimal.Value): Money {
    return new Money(base.amount.times(new Decimal(percent)).div(100), base.currency);
  }

  /** Scale by a dimensionless factor (e.g. a stage probability for pipeline value). */
  times(factor: Decimal.Value): Money {
    return new Money(this.amount.times(new Decimal(factor)), this.currency);
  }

  add(other: Money): Money {
    this.assertSameCurrency(other);
    return new Money(this.amount.plus(other.amount), this.currency);
  }

  subtract(other: Money): Money {
    this.assertSameCurrency(other);
    return new Money(this.amount.minus(other.amount), this.currency);
  }

  isNegative(): boolean {
    return this.amount.isNegative();
  }

  /** Round to the currency's minor unit (default 2dp), half-up. */
  round(decimals = 2): Money {
    return new Money(this.amount.toDecimalPlaces(decimals, Decimal.ROUND_HALF_UP), this.currency);
  }

  /** String for persistence into a Prisma Decimal column (done in the repo layer). */
  toString(): string {
    return this.amount.toFixed();
  }

  private assertSameCurrency(other: Money): void {
    if (other.currency !== this.currency) {
      throw new Error(`currency mismatch: ${this.currency} vs ${other.currency}`);
    }
  }
}
