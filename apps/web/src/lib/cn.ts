// Minimal class joiner — keeps component class lists readable without pulling in
// clsx/tailwind-merge. Falsy values are dropped.
export function cn(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(" ");
}
