// The illustration half of the login / signup two-panel box. The onboarding
// artwork is a wide infographic with its own two-tone background, so it's
// rendered full-bleed (object-cover) rather than floated — no clashing image
// rectangle against the panel. A bottom-up brand-green scrim — solid at the
// base, fading to clear up top — keeps the illustration visible while giving the
// white marketing copy a deep teal backing to read against. Desktop-only: on
// mobile, one-handed auth wins (Principle 8), so the form stands alone.
export interface AuthAsideProps {
  image: string;
  alt: string;
  eyebrow: string;
  headline: string;
  sub: string;
}

export function AuthAside({ image, alt, eyebrow, headline, sub }: AuthAsideProps) {
  return (
    <aside className="relative hidden overflow-hidden bg-brand-tint lg:block">
      <img
        src={image}
        alt={alt}
        decoding="async"
        className="absolute inset-0 h-full w-full object-cover object-center"
      />
      <div
        aria-hidden
        className="absolute inset-0 bg-gradient-to-t from-brand-hover via-brand/70 to-brand/0"
      />
      <div className="relative flex h-full flex-col justify-end p-10">
        <p className="text-label font-semibold uppercase tracking-wide text-white/70">{eyebrow}</p>
        <h2 className="mt-2 text-h1 font-bold text-white">{headline}</h2>
        <p className="mt-3 max-w-xs text-sm text-white/85">{sub}</p>
      </div>
    </aside>
  );
}
