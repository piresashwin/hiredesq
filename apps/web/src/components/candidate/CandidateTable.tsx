"use client";

import type { CandidateListItemDto } from "@hiredesq/shared";
import { cn } from "@/lib/cn";
import { timeAgo } from "@/lib/format";
import { Chip } from "@/components/ui/Badge";
import { SourceIcon } from "@/components/ui/SourceBadge";
import { Menu, type MenuItem } from "@/components/ui/Menu";
import { DownloadIcon, EyeIcon, MoreIcon, TrashIcon } from "@/components/ui/Icon";

// Dense, table-first candidate list (design-system §6.3). 40px compact rows,
// sticky header, hairlines (no zebra), hover affordance. Row click opens the
// slide-over profile (not a full navigation) so the recruiter keeps her place.
// Collapses to stacked cards on small screens (§9).

const MAX_SKILLS = 3;

export function CandidateTable({
  candidates,
  highlightIds,
  onSelect,
  onExport,
  onDelete,
}: {
  candidates: CandidateListItemDto[];
  /** Newly parsed rows — briefly tinted so the recruiter sees what just landed. */
  highlightIds?: Set<string>;
  onSelect: (c: CandidateListItemDto) => void;
  /** Row 3-dot actions. Optional — the menu column only renders when provided. */
  onExport?: (c: CandidateListItemDto) => void;
  onDelete?: (c: CandidateListItemDto) => void;
}) {
  const hasRowActions = Boolean(onExport || onDelete);

  // Build the row's 3-dot menu items from the handlers that were provided.
  const rowMenu = (c: CandidateListItemDto): MenuItem[] => {
    const items: MenuItem[] = [
      { key: "open", label: "Open profile", icon: <EyeIcon className="h-4 w-4" />, onSelect: () => onSelect(c) },
    ];
    if (onExport) {
      items.push({
        key: "export",
        label: "Export (JSON)",
        icon: <DownloadIcon className="h-4 w-4" />,
        onSelect: () => onExport(c),
      });
    }
    if (onDelete) {
      items.push({
        key: "delete",
        label: "Delete",
        icon: <TrashIcon className="h-4 w-4" />,
        destructive: true,
        onSelect: () => onDelete(c),
      });
    }
    return items;
  };
  return (
    <>
      {/* Desktop / tablet: dense table */}
      <div className="hidden overflow-x-auto sm:block">
        <table className="w-full border-collapse text-body">
          <thead className="bg-subtle">
            <tr className="text-left text-label uppercase text-muted">
              <Th className="pl-4">Name</Th>
              <Th>Role @ Company</Th>
              <Th>Location</Th>
              <Th>Skills</Th>
              <Th className="pr-4 text-right">Updated</Th>
              {hasRowActions ? <Th className="w-10 pr-2" aria-label="Actions" /> : null}
            </tr>
          </thead>
          <tbody>
            {candidates.map((c) => (
              <tr
                key={c.id}
                onClick={() => onSelect(c)}
                tabIndex={0}
                role="button"
                aria-label={`Open ${c.fullName}'s profile`}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    onSelect(c);
                  }
                }}
                className={cn(
                  "h-10 cursor-pointer border-b border-line transition hover:bg-subtle",
                  highlightIds?.has(c.id) && "bg-brand-tint/60",
                )}
              >
                <td className="max-w-[200px] truncate pl-4 pr-3">
                  <span className="flex items-center gap-1.5">
                    <SourceIcon source={c.source} />
                    <span className="truncate font-semibold text-ink">{c.fullName}</span>
                  </span>
                </td>
                <td className="max-w-[220px] truncate pr-3 text-muted">
                  {[c.currentTitle, c.currentCompany].filter(Boolean).join(" @ ") || "—"}
                </td>
                <td className="max-w-[160px] truncate pr-3 text-muted">{c.location || "—"}</td>
                <td className="pr-3">
                  <SkillChips skills={c.skills} />
                </td>
                <td className="nums whitespace-nowrap pr-4 text-right text-sm tabular-nums text-muted">
                  {timeAgo(c.updatedAt)}
                </td>
                {hasRowActions ? (
                  // stopPropagation so opening the menu doesn't also open the profile row.
                  <td
                    className="pr-2 text-right"
                    onClick={(e) => e.stopPropagation()}
                    onKeyDown={(e) => e.stopPropagation()}
                  >
                    <Menu
                      label={`Actions for ${c.fullName}`}
                      trigger={<MoreIcon className="h-5 w-5 p-0.5" />}
                      items={rowMenu(c)}
                    />
                  </td>
                ) : null}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Mobile: stacked cards (§9) */}
      <ul className="space-y-2 sm:hidden">
        {candidates.map((c) => (
          <li key={c.id}>
            <button
              type="button"
              onClick={() => onSelect(c)}
              className={cn(
                "w-full rounded-md border border-line bg-surface p-3 text-left transition active:bg-subtle",
                highlightIds?.has(c.id) && "border-brand/40 bg-brand-tint/50",
              )}
            >
              <span className="flex items-center gap-1.5">
                <SourceIcon source={c.source} />
                <span className="truncate font-semibold text-ink">{c.fullName}</span>
              </span>
              <span className="mt-0.5 block truncate text-sm text-muted">
                {[c.currentTitle, c.currentCompany].filter(Boolean).join(" @ ") || "—"}
              </span>
              {c.location ? (
                <span className="mt-0.5 block truncate text-sm text-muted">{c.location}</span>
              ) : null}
              <span className="mt-2 flex flex-wrap gap-1.5">
                <SkillChips skills={c.skills} />
              </span>
            </button>
          </li>
        ))}
      </ul>
    </>
  );
}

function Th({
  children,
  className,
  ...rest
}: {
  children?: React.ReactNode;
  className?: string;
} & React.ThHTMLAttributes<HTMLTableCellElement>) {
  return (
    <th className={cn("py-2 pr-3 font-medium", className)} {...rest}>
      {children}
    </th>
  );
}

function SkillChips({ skills }: { skills: string[] }) {
  if (skills.length === 0) return <span className="text-faint">—</span>;
  const shown = skills.slice(0, MAX_SKILLS);
  const extra = skills.length - shown.length;
  return (
    <span className="flex flex-wrap items-center gap-1">
      {shown.map((s) => (
        <Chip key={s}>{s}</Chip>
      ))}
      {extra > 0 ? <span className="text-sm text-faint">+{extra}</span> : null}
    </span>
  );
}
