import type { Metadata } from "next";
import { WaitlistForm } from "@/components/marketing/WaitlistForm";
import { Logo, LogoMark } from "@/components/marketing/Logo";
import {
  ChatIcon,
  FileIcon,
  CheckIcon,
  SparkleIcon,
  TrendingUpIcon,
  SearchIcon,
  UsersIcon,
} from "@/components/ui/Icon";

// Pre-launch waitlist landing — the public face of the brand and the site root.
// Everything here traces back to marketing/positioning.md + brand-identity.md:
//   • lead with the human 2-minute rescue, let "Revenue OS" ride as the frame
//   • the signature motif — messy inputs resolve into clean structure, L→R
//   • exactly ONE terracotta accent per frame (the conversion moment)
//   • the "after" uses seeded fake data only — never real candidate PII (§2)
// Static server component for SEO; the only interactive island is <WaitlistForm>.
// Signed-in beta users reach the app directly at /candidates (and login routes
// there on success) — the root is the marketing surface now.

export const metadata: Metadata = {
  title: "Hiredesq — forward anything, get hire-ready candidates",
  description:
    "Turn messy WhatsApp chats, resumes, and referrals into a clean, deduped, searchable candidate database in 2 minutes — and finally see what you've billed. Join the waitlist.",
};

export default function WaitlistLanding() {
  return (
    <main className="min-h-screen bg-canvas text-ink">
      {/* ── Top bar: full wordmark + descriptor, anchor to the form ───────── */}
      <header className="mx-auto flex max-w-6xl items-center justify-between px-6 py-5">
        <div className="flex items-center gap-3">
          <Logo />
          <span className="hidden text-label uppercase text-faint sm:inline">
            Clarity Engine for Hiring
          </span>
        </div>
        <a
          href="#join"
          className="inline-flex h-9 items-center rounded-md px-3 text-sm font-semibold text-brand transition hover:bg-brand-tint"
        >
          Join the waitlist
        </a>
      </header>

      {/* ── Hero: the lead promise + the capture. Soft-green wash, lots of
            space; terracotta lives only on the CTA below. ─────────────────── */}
      <section className="relative overflow-hidden border-b border-line bg-gradient-to-b from-brand-tint/60 to-canvas">
        <div className="mx-auto grid max-w-6xl items-center gap-12 px-6 py-16 lg:grid-cols-2 lg:py-24">
          <div>
            <span className="inline-flex items-center gap-2 rounded-full border border-brand/20 bg-surface px-3 py-1 text-label uppercase text-brand">
              <SparkleIcon className="h-3.5 w-3.5" title="" />
              Private beta · Recruiter Revenue OS
            </span>
            <h1 className="mt-5 text-4xl font-bold leading-[1.1] tracking-tight sm:text-5xl">
              Forward anything.
              <br />
              Get hire-ready candidates.
            </h1>
            <p className="mt-5 max-w-xl text-lg leading-relaxed text-muted">
              Forward your messy CVs, chats, and referrals — get hire-ready candidates in{" "}
              <span className="font-semibold text-ink">2 minutes</span>, and finally see what
              you&apos;ve billed.
            </p>
            <div id="join" className="mt-8 max-w-xl scroll-mt-24">
              <WaitlistForm />
            </div>
          </div>

          {/* The hero visual: chaos → structure, left to right. */}
          <ChaosToStructure />
        </div>
      </section>

      {/* ── Old way / New way narrative (positioning.md) ─────────────────── */}
      <section className="mx-auto max-w-6xl px-6 py-20">
        <h2 className="text-center text-h1 font-bold tracking-tight">
          Your business shouldn&apos;t live in six different apps.
        </h2>
        <div className="mt-12 grid gap-6 md:grid-cols-2">
          <article className="rounded-lg border border-line bg-surface p-7">
            <p className="text-label uppercase text-muted">The old way</p>
            <p className="mt-3 text-h3 text-ink">A WhatsApp group called &quot;Candidates ✅✅&quot;</p>
            <ul className="mt-4 space-y-3 text-body text-muted">
              <li>A Drive folder of CV_final_FINAL_v2.pdf.</li>
              <li>An Excel sheet you last touched when you had time.</li>
              <li>Your inbox, a job board, and your memory.</li>
              <li>You couldn&apos;t say what you&apos;ve billed this quarter if I asked.</li>
            </ul>
          </article>
          <article className="rounded-lg border border-brand/20 bg-brand-tint/50 p-7">
            <p className="text-label uppercase text-brand">The new way</p>
            <p className="mt-3 text-h3 text-ink">Forward the mess. Watch it become a database.</p>
            <ul className="mt-4 space-y-3 text-body text-ink/80">
              <li>Clean, deduped, searchable in two minutes — you didn&apos;t type a word.</li>
              <li>Attach candidates to a job. Mark a placement.</li>
              <li>Your revenue is right there: booked, in pipeline, coming next.</li>
              <li>The tool finally works for you.</li>
            </ul>
          </article>
        </div>
      </section>

      {/* ── Three pillars (positioning.md messaging pillars) ─────────────── */}
      <section className="border-y border-line bg-subtle/40">
        <div className="mx-auto grid max-w-6xl gap-6 px-6 py-20 md:grid-cols-3">
          <Pillar
            icon={<UsersIcon className="h-5 w-5" title="" />}
            title="Kill the empty state"
            body="Dump 200 resumes, a WhatsApp export, a folder of chaos. A real book of business appears in minutes — not after weeks of typing."
          />
          <Pillar
            icon={<TrendingUpIcon className="h-5 w-5" title="" />}
            title="See the money"
            body="Placements booked this month, pipeline value, what's coming next — native and one click away. The number incumbents bury three menus deep."
          />
          <Pillar
            icon={<SearchIcon className="h-5 w-5" title="" />}
            title="Built for the solo biller"
            body="No setup, no implementation, no enterprise tax. The clean, searchable database is free forever — built for the one person actually placing and getting paid."
          />
        </div>
      </section>

      {/* ── Revenue clarity: a number coming into focus (Believer voice) ─── */}
      <section className="mx-auto max-w-6xl px-6 py-20">
        <div className="grid items-center gap-10 rounded-lg border border-line bg-surface p-8 sm:p-12 lg:grid-cols-2">
          <div>
            <p className="text-label uppercase text-muted">Revenue booked · June</p>
            <p className="nums mt-2 text-5xl font-bold tracking-tight text-money sm:text-6xl">
              $24,000
            </p>
            <p className="nums mt-3 text-body text-muted">
              3 placements this month · $41,000 weighted pipeline
            </p>
          </div>
          <p className="text-h3 font-normal leading-relaxed text-ink/80">
            Every figure ties back to the placement behind it — no black-box totals. For the first
            time, you open the app just to{" "}
            <span className="font-semibold text-ink">see what you&apos;ve made.</span>
          </p>
        </div>
      </section>

      {/* ── Anti-positioning (positioning.md — "say it out loud") ────────── */}
      <section className="border-t border-line">
        <div className="mx-auto max-w-3xl px-6 py-20 text-center">
          <h2 className="text-h1 font-bold tracking-tight">What Hiredesq is not</h2>
          <p className="mt-5 text-lg leading-relaxed text-muted">
            Not an ATS for HR teams. Not another CRM you have to feed. Not enterprise software with
            implementation fees. And not &quot;AI that replaces recruiters&quot; — the AI does the
            data grunt work, <span className="font-semibold text-ink">you keep the commission.</span>
          </p>
        </div>
      </section>

      {/* ── Final CTA ─────────────────────────────────────────────────────── */}
      <section className="bg-brand-tint/60">
        <div className="mx-auto max-w-2xl px-6 py-20 text-center">
          <h2 className="text-h1 font-bold tracking-tight">
            From WhatsApp chaos to hire-ready candidates.
          </h2>
          <p className="mt-3 text-body text-muted">
            Be first in when your desk opens. Solo recruiters get in free, forever.
          </p>
          <div className="mx-auto mt-8 max-w-xl text-left">
            <WaitlistForm />
          </div>
        </div>
      </section>

      <footer className="border-t border-line">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-3 px-6 py-8 text-sm text-muted sm:flex-row">
          <div className="flex items-center gap-2">
            <LogoMark className="h-6" />
            <span className="font-bold">
              <span className="text-ink">Hire</span>
              <span className="text-brand">desq</span>
            </span>
          </div>
          <p>Clarity Engine for Hiring · Built for India + US-IT recruiters</p>
        </div>
      </footer>
    </main>
  );
}

// ── A pillar card ──────────────────────────────────────────────────────────
function Pillar({
  icon,
  title,
  body,
}: {
  icon: React.ReactNode;
  title: string;
  body: string;
}) {
  return (
    <article className="rounded-lg border border-line bg-surface p-7">
      <span className="grid h-10 w-10 place-items-center rounded-md bg-brand-tint text-brand">
        {icon}
      </span>
      <h3 className="mt-4 text-h3">{title}</h3>
      <p className="mt-2 text-body leading-relaxed text-muted">{body}</p>
    </article>
  );
}

// ── The signature motif: messy inputs (left) resolve into clean candidate
//    cards (right), with the terracotta arrow marking the conversion in between
//    (brand-identity.md). The "after" cards are seeded demo data — no real PII.
function ChaosToStructure() {
  return (
    <div className="relative flex flex-col gap-4 sm:grid sm:grid-cols-[1fr_auto_1.2fr] sm:items-center sm:gap-4">
      {/* Left — the chaos */}
      <div className="flex flex-col gap-3">
        <MessChip className="rotate-[-3deg]">
          <ChatIcon className="h-4 w-4 shrink-0 text-info" title="" />
          <span className="truncate">&quot;here&apos;s that React dev 👇&quot;</span>
        </MessChip>
        <MessChip className="rotate-[2deg]">
          <FileIcon className="h-4 w-4 shrink-0 text-muted" title="" />
          <span className="truncate">CV_final_v2.pdf</span>
        </MessChip>
        <MessChip className="rotate-[-1deg]">
          <ChatIcon className="h-4 w-4 shrink-0 text-info" title="" />
          <span className="truncate">chat_export.txt</span>
        </MessChip>
        <MessChip className="rotate-[3deg]">
          <FileIcon className="h-4 w-4 shrink-0 text-muted" title="" />
          <span className="truncate">scan_0042.jpg</span>
        </MessChip>
      </div>

      {/* Middle — the conversion moment (the single orange accent) */}
      <div
        aria-hidden
        className="mx-auto grid h-9 w-9 place-items-center rounded-full bg-accent text-white shadow-sm sm:mx-0"
      >
        <svg
          viewBox="0 0 24 24"
          className="h-5 w-5 rotate-90 sm:rotate-0"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
        >
          <path d="M5 12h14M13 6l6 6-6 6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </div>

      {/* Right — the clarity (seeded fake candidates) */}
      <div className="flex flex-col gap-3">
        <CandidateCard name="Sarah Chen" role="Senior PM · Bangalore" />
        <CandidateCard name="Arjun Mehta" role="Staff Engineer · Bangalore" />
        <CandidateCard name="Priyanka Rao" role="Data Scientist · Pune" merged />
      </div>
    </div>
  );
}

function MessChip({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div
      className={`flex items-center gap-2 rounded-md border border-line bg-surface/80 px-3 py-2 text-sm text-muted shadow-sm ${className ?? ""}`}
    >
      {children}
    </div>
  );
}

function CandidateCard({
  name,
  role,
  merged = false,
}: {
  name: string;
  role: string;
  merged?: boolean;
}) {
  return (
    <div className="reveal-field rounded-md border border-line bg-surface p-3 shadow-sm">
      <div className="flex items-center justify-between gap-2">
        <p className="truncate text-h3">{name}</p>
        <CheckIcon className="h-4 w-4 shrink-0 text-brand" title="Parsed" />
      </div>
      <p className="mt-0.5 truncate text-sm text-muted">{role}</p>
      {merged && (
        <span className="mt-2 inline-flex items-center gap-1 rounded-sm bg-brand-tint px-1.5 py-0.5 text-label uppercase text-brand">
          merged · chat + resume
        </span>
      )}
    </div>
  );
}
