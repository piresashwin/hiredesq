import type { Step } from "react-joyride";
import type { TourScreen } from "@hiredesq/shared";

// On-screen guided tours. Each screen has a short (3–4 step) walkthrough the
// recruiter starts on demand from the help icon in the top bar (no auto-start).
// Steps target stable `data-tour="<key>"` attributes added to the screens — we
// deliberately anchor to elements present at every breakpoint (top bar + the
// in-`main` content) so a step never points at the desktop-only sidebar.
//
// Copy is short and recruiter-voiced (design-system / brand-voice): say what the
// thing does for them, not what the button is called.

// The help icon in the top bar — every tour ends here so the recruiter knows
// where to replay it. Present on all app screens.
const LAUNCHER = '[data-tour="tour-launcher"]';

const REPLAY_STEP: Step = {
  target: LAUNCHER,
  title: "Replay anytime",
  content: "Stuck later? This button restarts the tour for whatever screen you're on.",
  placement: "bottom",
};

export const TOURS: Record<TourScreen, Step[]> = {
  home: [
    {
      target: '[data-tour="home-glance"]',
      title: "Your desk at a glance",
      content:
        "Cleared revenue, candidates, and open jobs — the numbers that matter, the moment you land. Tap any tile to dive in.",
      placement: "bottom",
    },
    {
      target: '[data-tour="home-attention"]',
      title: "What needs you today",
      content:
        "Placements about to clear, candidates waiting on a reply — your daily to-do, surfaced automatically.",
      placement: "top",
    },
    REPLAY_STEP,
  ],
  candidates: [
    {
      target: '[data-tour="candidates-add"]',
      title: "Pour your mess in here",
      content:
        "Forward a WhatsApp chat, drop a folder of CVs, paste an email. We parse, clean, and dedupe it into real candidates.",
      placement: "bottom",
    },
    {
      target: '[data-tour="candidates-search"]',
      title: "Search how you think",
      content:
        "Type a name or skill — or flip to meaning-based search and describe the person you need in plain words.",
      placement: "bottom",
    },
    {
      target: '[data-tour="candidates-list"]',
      title: "Your clean database",
      content:
        "Every candidate, deduplicated and searchable. Click a row to open the full profile and edit anything inline.",
      placement: "top",
    },
    REPLAY_STEP,
  ],
  jobs: [
    {
      target: '[data-tour="jobs-create"]',
      title: "Track every role",
      content:
        "Open a job and attach the candidates you're sourcing for it — that's how the inbound CVs land in the right place.",
      placement: "bottom",
    },
    {
      target: '[data-tour="jobs-list"]',
      title: "Pipelines, not spreadsheets",
      content:
        "See each job's stage and pipeline value at a glance. Open one to move candidates through to placed.",
      placement: "top",
    },
    REPLAY_STEP,
  ],
  revenue: [
    {
      target: '[data-tour="revenue-headline"]',
      title: "See the money",
      content:
        "Your cleared revenue — fees from placements whose guarantee window has elapsed. This is real, banked income.",
      placement: "bottom",
    },
    {
      target: '[data-tour="revenue-breakdown"]',
      title: "Cleared vs at-risk",
      content:
        "Fees still inside the guarantee window are shown as at-risk, never counted as final — so your headline number is honest.",
      placement: "top",
    },
    REPLAY_STEP,
  ],
};

// Map a pathname to the tour screen it belongs to, or null if the route has no
// tour (so the help icon hides itself). Matches the route prefix so detail pages
// like /jobs/[id] still resolve to the jobs tour.
export function screenForPath(pathname: string | null): TourScreen | null {
  if (!pathname) return null;
  if (pathname === "/home" || pathname.startsWith("/home/")) return "home";
  if (pathname.startsWith("/candidates")) return "candidates";
  if (pathname.startsWith("/jobs")) return "jobs";
  if (pathname.startsWith("/revenue")) return "revenue";
  return null;
}
