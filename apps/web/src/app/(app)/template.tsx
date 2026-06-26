// Page-level transition for the app shell. A `template` (not `layout`) remounts
// on every navigation, so the entrance replays per route while the persistent
// shell (sidebar/topbar in layout.tsx) stays put. Reuses the `revealField`
// keyframe (4px rise + fade); subtle by design — §8 motion budget is small. The
// `motion-safe:` prefix + the global prefers-reduced-motion block degrade it to
// an instant render. Animates only the content region, never the chrome.
export default function Template({ children }: { children: React.ReactNode }) {
  return <div className="motion-safe:reveal-field">{children}</div>;
}
