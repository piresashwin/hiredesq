import type { Config } from "tailwindcss";

// Design tokens — the single source of truth is the CSS custom properties in
// src/app/globals.css; this file just maps them into Tailwind's scale. Reuse
// these tokens, never invent one-off hex values in components.
// See docs/design-system.md and the `design-system` skill.
//
// Tokens are stored as space-separated RGB channels so Tailwind's `/<alpha>`
// modifiers keep working (e.g. `border-ink/10`, `ring-brand/30`).
const ch = (v: string) => `rgb(var(${v}) / <alpha-value>)`;

export default {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // surfaces & text
        ink: ch("--color-ink"), // text-strong (headings, names, values)
        canvas: ch("--color-canvas"), // app background (warm off-white)
        surface: ch("--color-surface"), // cards, tables, panels
        subtle: ch("--color-subtle"), // section bg, table header, hover row
        line: ch("--color-line"), // hairlines, dividers, input borders
        muted: ch("--color-muted"), // labels, metadata, secondary text
        faint: ch("--color-faint"), // placeholders, disabled

        // brand — calm teal-green ("placements / growth")
        brand: {
          DEFAULT: ch("--color-brand"),
          fg: ch("--color-brand-fg"),
          hover: ch("--color-brand-hover"),
          tint: ch("--color-brand-tint"),
        },
        accent: ch("--color-accent"), // terracotta highlight / win moments

        // semantic — money is the brand green (revenue = growth)
        money: ch("--color-money"),
        success: { DEFAULT: ch("--color-success"), tint: ch("--color-success-tint") },
        warning: { DEFAULT: ch("--color-warning"), tint: ch("--color-warning-tint") },
        danger: { DEFAULT: ch("--color-danger"), tint: ch("--color-danger-tint") },
        info: ch("--color-info"),

        // pipeline stages (Sourced → Submitted → Interview → Placed → Rejected)
        stage: {
          sourced: ch("--color-stage-sourced"),
          submitted: ch("--color-stage-submitted"),
          interview: ch("--color-stage-interview"),
          placed: ch("--color-stage-placed"),
          rejected: ch("--color-stage-rejected"),
        },
      },
      fontFamily: {
        sans: ["ui-sans-serif", "system-ui", "Segoe UI", "sans-serif"],
      },
      fontSize: {
        // [size, line-height] — recruiter-dense; 14px is the body default
        display: ["1.875rem", { lineHeight: "2.25rem", fontWeight: "700" }],
        h1: ["1.5rem", { lineHeight: "2rem", fontWeight: "600" }],
        h2: ["1.25rem", { lineHeight: "1.75rem", fontWeight: "600" }],
        h3: ["1rem", { lineHeight: "1.5rem", fontWeight: "600" }],
        body: ["0.875rem", { lineHeight: "1.25rem" }],
        sm: ["0.8125rem", { lineHeight: "1.125rem" }],
        label: ["0.75rem", { lineHeight: "1rem", letterSpacing: "0.02em", fontWeight: "500" }],
      },
      borderRadius: {
        sm: "6px", // inputs, chips
        md: "10px", // buttons, cards
        lg: "14px", // modals, dropzone
      },
      boxShadow: {
        sm: "0 1px 2px rgb(26 26 46 / 0.06)", // card hover, sticky headers
        md: "0 4px 12px rgb(26 26 46 / 0.10)", // popovers, dropdowns
        lg: "0 12px 32px rgb(26 26 46 / 0.16)", // modals, drag ghost
      },
      transitionDuration: {
        DEFAULT: "140ms", // standard ease-out UI transition (§8 motion budget)
      },
    },
  },
  plugins: [],
} satisfies Config;
