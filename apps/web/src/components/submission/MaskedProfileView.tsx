import type { MaskedProfileDto } from "@hiredesq/shared";
import { Chip } from "@/components/ui/Badge";
import { LockIcon, SparkleIcon } from "@/components/ui/Icon";

// The read-only, contact-MASKED client-ready profile (§2D, Wedge 2). Rendered
// both in the recruiter's preview and on the public client-facing share page, so
// it stays a pure, hook-free presentational component. By contract the masked DTO
// carries NO email/phone (CLAUDE.md §2) — we never render contact, only the
// "contact via the agency" treatment in its place.

/** Format an ExperienceEntry's date range ("2021 — Present", "2018 — 2021"). */
function dateRange(start?: string, end?: string | null): string {
  const year = (iso?: string | null) => (iso ? iso.slice(0, 4) : "");
  const from = year(start);
  const to = end === null ? "Present" : year(end);
  if (from && to) return `${from} — ${to}`;
  return from || to || "";
}

export function MaskedProfileView({
  profile,
  summary,
}: {
  profile: MaskedProfileDto;
  summary: string;
}) {
  const role = [profile.currentTitle, profile.currentCompany].filter(Boolean).join(" · ");

  return (
    <article className="space-y-6">
      {/* Identity header */}
      <header>
        <h1 className="text-h1 text-ink">{profile.fullName}</h1>
        {role ? <p className="mt-1 text-body text-muted">{role}</p> : null}
        {profile.location ? <p className="mt-0.5 text-sm text-muted">{profile.location}</p> : null}
      </header>

      {/* AI summary prose — the branded pitch */}
      {summary ? (
        <section aria-label="Summary">
          <h2 className="flex items-center gap-1.5 text-label uppercase text-muted">
            <SparkleIcon className="h-3.5 w-3.5 text-brand" aria-hidden />
            Summary
          </h2>
          <p className="mt-2 text-body leading-relaxed text-ink">{summary}</p>
        </section>
      ) : null}

      {/* Contact-masked treatment — never an email/phone, by design */}
      <section
        className="flex items-start gap-3 rounded-md border border-line bg-subtle/60 p-3.5"
        aria-label="Contact details"
      >
        <LockIcon className="mt-0.5 h-4 w-4 shrink-0 text-muted" aria-hidden />
        <div>
          <p className="text-body font-medium text-ink">Contact details hidden</p>
          <p className="mt-0.5 text-sm text-muted">
            Reach this candidate through the agency — we&apos;ll make the introduction.
          </p>
        </div>
      </section>

      {/* Skills */}
      {profile.skills.length > 0 ? (
        <section aria-label="Skills">
          <h2 className="text-label uppercase text-muted">Skills</h2>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {profile.skills.map((s) => (
              <Chip key={s}>{s}</Chip>
            ))}
          </div>
        </section>
      ) : null}

      {/* Experience */}
      {profile.experience.length > 0 ? (
        <section aria-label="Experience">
          <h2 className="text-label uppercase text-muted">Experience</h2>
          <ul className="mt-2 space-y-3">
            {profile.experience.map((exp, i) => (
              <li key={`${exp.company}-${exp.title}-${i}`} className="flex flex-col">
                <div className="flex flex-wrap items-baseline justify-between gap-x-3">
                  <span className="text-body font-semibold text-ink">{exp.title}</span>
                  {dateRange(exp.startDate, exp.endDate) ? (
                    <span className="nums shrink-0 text-sm tabular-nums text-muted">
                      {dateRange(exp.startDate, exp.endDate)}
                    </span>
                  ) : null}
                </div>
                <span className="text-body text-muted">{exp.company}</span>
                {exp.summary ? (
                  <p className="mt-1 text-sm leading-relaxed text-muted">{exp.summary}</p>
                ) : null}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {/* Education */}
      {profile.education.length > 0 ? (
        <section aria-label="Education">
          <h2 className="text-label uppercase text-muted">Education</h2>
          <ul className="mt-2 space-y-2">
            {profile.education.map((edu, i) => (
              <li key={`${edu.institution}-${i}`} className="flex flex-col">
                <div className="flex flex-wrap items-baseline justify-between gap-x-3">
                  <span className="text-body font-semibold text-ink">{edu.institution}</span>
                  {edu.endDate ? (
                    <span className="nums shrink-0 text-sm tabular-nums text-muted">
                      {edu.endDate.slice(0, 4)}
                    </span>
                  ) : null}
                </div>
                {[edu.degree, edu.field].filter(Boolean).length > 0 ? (
                  <span className="text-body text-muted">
                    {[edu.degree, edu.field].filter(Boolean).join(", ")}
                  </span>
                ) : null}
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </article>
  );
}
