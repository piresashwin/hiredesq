import { forwardRef, type ButtonHTMLAttributes } from "react";
import { cn } from "@/lib/cn";

// Buttons (design-system §6.1). One PRIMARY per view (the single main action —
// "Add candidates", "Log placement"). Everything else is secondary / ghost.
// Destructive is reserved for PII delete / reject and should carry a confirm.
type Variant = "primary" | "secondary" | "ghost" | "destructive";
type Size = "sm" | "md" | "lg";

const VARIANTS: Record<Variant, string> = {
  primary: "bg-brand text-brand-fg hover:bg-brand-hover",
  secondary: "bg-surface text-ink border border-line hover:bg-subtle",
  ghost: "text-muted hover:bg-subtle hover:text-ink",
  destructive: "bg-danger text-white hover:opacity-90",
};

const SIZES: Record<Size, string> = {
  sm: "h-8 px-3 text-sm rounded-md gap-1.5",
  md: "h-10 px-4 text-body rounded-md gap-2",
  lg: "h-12 px-5 text-body rounded-md gap-2",
};

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = "secondary", size = "md", className, type = "button", ...props },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      className={cn(
        "inline-flex items-center justify-center font-semibold transition",
        "disabled:cursor-not-allowed disabled:opacity-40",
        VARIANTS[variant],
        SIZES[size],
        className,
      )}
      {...props}
    />
  );
});
