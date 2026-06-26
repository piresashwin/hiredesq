import { cn } from "@/lib/cn";
import { avatarTint, initialsOf } from "@/lib/pipeline";

// Initials avatar (design-system §6.5) — recruiters scan lists by person, so a
// small coloured initial circle anchors each candidate. Colour is deterministic
// per id (a warm token palette, never raw hex) so the same person always wears
// the same tint. Decorative: the visible name is the accessible label, so the
// circle itself is aria-hidden.

export function Avatar({
  name,
  id,
  size = "md",
  className,
}: {
  name: string;
  /** Stable key for the colour (candidate id) — falls back to the name. */
  id?: string;
  size?: "sm" | "md";
  className?: string;
}) {
  const dims = size === "sm" ? "h-6 w-6 text-label" : "h-8 w-8 text-sm";
  return (
    <span
      aria-hidden
      className={cn(
        "inline-flex shrink-0 select-none items-center justify-center rounded-full font-semibold",
        dims,
        avatarTint(id ?? name),
        className,
      )}
    >
      {initialsOf(name)}
    </span>
  );
}
