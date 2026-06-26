"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useRouter } from "next/navigation";
import type { CandidateListItemDto } from "@hiredesq/shared";
import { api } from "@/lib/api";
import { cn } from "@/lib/cn";
import { useFocusTrap } from "@/lib/useFocusTrap";
import { ArrowRightIcon, CloseIcon, SearchIcon, SparkleIcon } from "@/components/ui/Icon";
import { Chip } from "@/components/ui/Badge";

// Global ⌘K "spotlight" (design-system §5/§6.3). A command-palette overlay that
// runs the candidate search — semantic by default ("describe who you want"),
// with a keyword fallback. Search is free (not credit-gated, CLAUDE.md §4). Open
// with ⌘K / Ctrl-K anywhere, or the sidebar Search button. Selecting a result
// hands off to the candidates desk, which opens that profile (?open=<id>).

interface SpotlightContextValue {
  open: () => void;
}

const SpotlightContext = createContext<SpotlightContextValue | null>(null);

export function SpotlightProvider({ children }: { children: ReactNode }) {
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setIsOpen((v) => !v);
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  const value = useMemo(() => ({ open: () => setIsOpen(true) }), []);

  return (
    <SpotlightContext.Provider value={value}>
      {children}
      {isOpen ? <Spotlight onClose={() => setIsOpen(false)} /> : null}
    </SpotlightContext.Provider>
  );
}

export function useSpotlight(): SpotlightContextValue {
  const ctx = useContext(SpotlightContext);
  if (!ctx) throw new Error("useSpotlight must be used within SpotlightProvider");
  return ctx;
}

// Recruiter-flavoured starters for the empty state — they teach that semantic
// search takes a *description*, not keywords, and give a one-click way in
// (design-system Principle 2: kill the empty state).
const EXAMPLE_QUERIES = [
  "ICU nurses with a Gulf visa",
  "React developers open to relocation",
  "Arabic-speaking sales reps in Dubai",
  "Senior accountants, CPA qualified",
];

// Initials for the result avatar. Cheap, deterministic, no PII leaves the row.
function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  const first = parts[0]![0] ?? "";
  const last = parts.length > 1 ? (parts[parts.length - 1]![0] ?? "") : "";
  return (first + last).toUpperCase() || "?";
}

/** A keycap, for the footer keyboard hints. */
function Kbd({ children }: { children: ReactNode }) {
  return (
    <kbd className="rounded border border-line bg-subtle px-1.5 py-0.5 text-[11px] font-medium leading-none text-muted">
      {children}
    </kbd>
  );
}

function Spotlight({ onClose }: { onClose: () => void }) {
  const router = useRouter();
  const panelRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  useFocusTrap(panelRef, true, onClose);

  const [term, setTerm] = useState("");
  const [debounced, setDebounced] = useState("");
  const [semantic, setSemantic] = useState(true);
  const [results, setResults] = useState<CandidateListItemDto[]>([]);
  const [loading, setLoading] = useState(false);
  const [active, setActive] = useState(0);
  const reqId = useRef(0);

  // Debounce the query.
  useEffect(() => {
    const id = window.setTimeout(() => setDebounced(term.trim()), 200);
    return () => window.clearTimeout(id);
  }, [term]);

  // Run the search (race-guarded — only the latest response wins).
  useEffect(() => {
    if (!debounced) {
      setResults([]);
      setLoading(false);
      return;
    }
    const ticket = ++reqId.current;
    setLoading(true);
    api
      .listCandidates(debounced, semantic)
      .then((res) => {
        if (ticket !== reqId.current) return;
        setResults(res.items);
        setActive(0);
      })
      .catch(() => {
        if (ticket === reqId.current) setResults([]);
      })
      .finally(() => {
        if (ticket === reqId.current) setLoading(false);
      });
  }, [debounced, semantic]);

  // Keep the keyboard-highlighted row in view as the user arrows through.
  useEffect(() => {
    listRef.current
      ?.querySelector<HTMLElement>(`[data-idx="${active}"]`)
      ?.scrollIntoView({ block: "nearest" });
  }, [active]);

  const select = useCallback(
    (c: CandidateListItemDto) => {
      onClose();
      router.push(`/candidates?open=${encodeURIComponent(c.id)}`);
    },
    [onClose, router],
  );

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((i) => Math.min(i + 1, results.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const c = results[active];
      if (c) select(c);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center p-4 sm:pt-[12vh]">
      <button
        type="button"
        aria-label="Close search"
        tabIndex={-1}
        onClick={onClose}
        className="absolute inset-0 bg-ink/40 motion-safe:animate-[fade_140ms_ease-out] sm:backdrop-blur-sm"
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label="Search candidates"
        className={cn(
          "relative flex max-h-[70vh] w-full max-w-2xl flex-col overflow-hidden rounded-lg border border-line bg-surface shadow-lg outline-none ring-1 ring-ink/5",
          "motion-safe:animate-[popIn_140ms_ease-out]",
        )}
        onKeyDown={onKeyDown}
      >
        {/* Search input */}
        <div className="flex items-center gap-3 border-b border-line px-4">
          <span
            className={cn(
              "flex h-8 w-8 shrink-0 items-center justify-center rounded-md transition",
              semantic ? "bg-brand-tint text-brand" : "text-faint",
            )}
            aria-hidden
          >
            {semantic ? <SparkleIcon className="h-4 w-4" /> : <SearchIcon className="h-4 w-4" />}
          </span>
          <input
            ref={inputRef}
            autoFocus
            value={term}
            onChange={(e) => setTerm(e.target.value)}
            placeholder={
              semantic
                ? "Describe who you're looking for — e.g. ICU nurses with a Gulf visa"
                : "Search name, skill, role…"
            }
            aria-label="Search candidates"
            className="h-16 min-w-0 flex-1 bg-transparent text-body text-ink placeholder:text-faint focus:outline-none"
          />
          {term ? (
            <button
              type="button"
              onClick={() => {
                setTerm("");
                inputRef.current?.focus();
              }}
              aria-label="Clear search"
              className="flex h-6 w-6 shrink-0 items-center justify-center rounded-sm text-faint transition hover:bg-subtle hover:text-ink"
            >
              <CloseIcon className="h-4 w-4" />
            </button>
          ) : null}
          {/* Semantic / keyword segmented control */}
          <div
            role="group"
            aria-label="Search mode"
            className="flex shrink-0 items-center gap-0.5 rounded-md bg-subtle p-0.5 text-label font-medium"
          >
            {([true, false] as const).map((isSemantic) => (
              <button
                key={String(isSemantic)}
                type="button"
                onClick={() => setSemantic(isSemantic)}
                aria-pressed={semantic === isSemantic}
                className={cn(
                  "rounded-[5px] px-2.5 py-1 transition",
                  semantic === isSemantic
                    ? "bg-surface text-brand shadow-sm"
                    : "text-muted hover:text-ink",
                )}
              >
                {isSemantic ? "Semantic" : "Keyword"}
              </button>
            ))}
          </div>
        </div>

        {/* Results */}
        <div className="min-h-0 flex-1 overflow-y-auto p-2">
          {!debounced ? (
            <div className="px-3 py-5">
              {semantic ? (
                <>
                  <p className="px-0.5 text-label font-medium uppercase tracking-wide text-faint">
                    Try describing a candidate
                  </p>
                  <div className="mt-2.5 flex flex-wrap gap-2">
                    {EXAMPLE_QUERIES.map((q) => (
                      <button
                        key={q}
                        type="button"
                        onClick={() => {
                          setTerm(q);
                          inputRef.current?.focus();
                        }}
                        className="inline-flex items-center gap-1.5 rounded-md border border-line bg-canvas px-2.5 py-1.5 text-sm text-muted transition hover:border-brand/40 hover:bg-brand-tint hover:text-brand"
                      >
                        <SparkleIcon className="h-3.5 w-3.5 shrink-0 text-brand" aria-hidden />
                        {q}
                      </button>
                    ))}
                  </div>
                </>
              ) : (
                <p className="py-2 text-center text-sm text-muted">
                  Start typing to search by name, skill, or role.
                </p>
              )}
            </div>
          ) : loading && results.length === 0 ? (
            <ul className="space-y-1" aria-hidden>
              {[0, 1, 2].map((i) => (
                <li key={i} className="flex items-center gap-3 px-3 py-2.5">
                  <div className="h-9 w-9 shrink-0 rounded-full bg-subtle motion-safe:animate-pulse" />
                  <div className="flex-1 space-y-1.5">
                    <div className="h-3.5 w-2/5 rounded bg-subtle motion-safe:animate-pulse" />
                    <div className="h-3 w-3/5 rounded bg-subtle motion-safe:animate-pulse" />
                  </div>
                </li>
              ))}
            </ul>
          ) : results.length === 0 ? (
            <div className="px-3 py-10 text-center">
              <p className="text-sm text-muted">
                No candidates match “<span className="font-medium text-ink">{debounced}</span>”.
              </p>
              {semantic ? (
                <button
                  type="button"
                  onClick={() => setSemantic(false)}
                  className="mt-1.5 text-sm font-medium text-brand transition hover:text-brand-hover"
                >
                  Try a keyword search instead
                </button>
              ) : null}
            </div>
          ) : (
            <>
              <p className="px-3 py-1.5 text-label font-medium uppercase tracking-wide text-faint">
                {results.length} {results.length === 1 ? "candidate" : "candidates"}
              </p>
              <ul ref={listRef}>
                {results.map((c, i) => {
                  const subtitle =
                    [c.currentTitle, c.currentCompany].filter(Boolean).join(" @ ") ||
                    c.location ||
                    "—";
                  const isActive = i === active;
                  return (
                    <li key={c.id}>
                      <button
                        type="button"
                        data-idx={i}
                        onClick={() => select(c)}
                        onMouseEnter={() => setActive(i)}
                        className={cn(
                          "group flex w-full items-start gap-3 rounded-md py-2 pl-2.5 pr-3 text-left transition",
                          isActive ? "bg-subtle" : "hover:bg-subtle",
                        )}
                      >
                        <span
                          className={cn(
                            "mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-sm font-semibold transition",
                            isActive
                              ? "bg-brand text-brand-fg"
                              : "bg-brand-tint text-brand",
                          )}
                          aria-hidden
                        >
                          {initials(c.fullName)}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-body font-medium text-ink">
                            {c.fullName}
                          </span>
                          <span className="block truncate text-sm text-muted">{subtitle}</span>
                          {c.skills.length > 0 ? (
                            <span className="mt-1.5 flex flex-wrap gap-1">
                              {c.skills.slice(0, 4).map((s) => (
                                <Chip key={s}>{s}</Chip>
                              ))}
                            </span>
                          ) : null}
                        </span>
                        <ArrowRightIcon
                          className={cn(
                            "mt-2 h-4 w-4 shrink-0 text-faint transition",
                            isActive ? "opacity-100" : "opacity-0 group-hover:opacity-60",
                          )}
                          aria-hidden
                        />
                      </button>
                    </li>
                  );
                })}
              </ul>
            </>
          )}
        </div>

        {/* Footer hint */}
        <div className="flex items-center justify-between gap-3 border-t border-line bg-canvas/40 px-4 py-2.5 text-label text-faint">
          <span className="inline-flex items-center gap-1.5">
            {semantic ? (
              <>
                <SparkleIcon className="h-3.5 w-3.5 text-brand" aria-hidden />
                Searching by meaning
              </>
            ) : (
              "Keyword search"
            )}
          </span>
          <span className="hidden items-center gap-1.5 sm:inline-flex">
            <Kbd>↑</Kbd>
            <Kbd>↓</Kbd>
            <span className="mr-1">navigate</span>
            <Kbd>↵</Kbd>
            <span className="mr-1">open</span>
            <Kbd>esc</Kbd>
            close
          </span>
        </div>
      </div>
    </div>
  );
}
