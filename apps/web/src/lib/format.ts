// Small display formatters. Numbers/dates render with tabular figures at the
// call site (the `.nums` utility); these just produce the strings.

/** Relative "time ago" for provenance + Updated columns ("3m ago", "2d ago"). */
export function timeAgo(iso: string, now: number = Date.now()): string {
  const diff = now - Date.parse(iso);
  if (!Number.isFinite(diff)) return "";
  const mins = Math.round(diff / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days < 30) return `${days}d ago`;
  const months = Math.round(days / 30);
  if (months < 12) return `${months}mo ago`;
  return `${Math.round(months / 12)}y ago`;
}

/** A short month-day label ("Jul 1") for dates — locale-aware. */
export function shortDate(iso: string): string {
  const ms = Date.parse(iso);
  if (!Number.isFinite(ms)) return "";
  return new Date(ms).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

/**
 * When the free AI credits reset, in daily-cadence terms (§4: 5/day, no
 * rollover, resetsAt = start of the next day). Returns "today", "tomorrow", or a
 * short date for anything further out — never a monthly "renews" phrasing.
 */
export function resetLabel(iso: string, now: number = Date.now()): string {
  const ms = Date.parse(iso);
  if (!Number.isFinite(ms)) return "";
  const startOfDay = (t: number) => {
    const d = new Date(t);
    d.setHours(0, 0, 0, 0);
    return d.getTime();
  };
  const dayDiff = Math.round((startOfDay(ms) - startOfDay(now)) / 86_400_000);
  if (dayDiff <= 0) return "today";
  if (dayDiff === 1) return "tomorrow";
  return shortDate(iso);
}

/** "Title @ Company" line for a candidate-ish object; empty parts drop out. The
 * single source for this label (was re-rolled across the board, table, profile). */
export function roleLine(
  c?: { currentTitle?: string | null; currentCompany?: string | null } | null,
): string {
  if (!c) return "";
  return [c.currentTitle, c.currentCompany].filter(Boolean).join(" @ ");
}

/** Format a money amount (string or number) as currency — the single Intl source.
 * DISPLAY ONLY; never compute money in JS (amounts arrive pre-resolved, §3). */
export function formatCurrency(amount: string | number, currency = "USD"): string {
  const value = typeof amount === "string" ? Number(amount) : amount;
  return new Intl.NumberFormat(undefined, {
    style: "currency",
    currency,
    maximumFractionDigits: 2,
  }).format(Number.isFinite(value) ? value : 0);
}

/** Cents-safe count × per-unit amount for DISPLAY-only pipeline estimates — avoids
 * binary-float drift from `count * Number(fee)` (§3). Returns a 2dp string or null. */
export function estimateTotal(amount: string | null | undefined, count: number): string | null {
  if (!amount) return null;
  const cents = Math.round(Number(amount) * 100);
  if (!Number.isFinite(cents)) return null;
  return ((cents * count) / 100).toFixed(2);
}

/** A clean E.164-ish tel: href (digits + leading +). */
export function telHref(phone: string): string {
  return `tel:${phone.replace(/[^\d+]/g, "")}`;
}

/** WhatsApp deep link (wa.me wants digits only, no +). */
export function whatsappHref(phone: string): string {
  return `https://wa.me/${phone.replace(/\D/g, "")}`;
}
