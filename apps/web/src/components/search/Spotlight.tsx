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
import { Command } from "cmdk";
import * as Dialog from "@radix-ui/react-dialog";
import type { CandidateListItemDto } from "@hiredesq/shared";
import { api } from "@/lib/api";
import { cn } from "@/lib/cn";
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
  const inputRef = useRef<HTMLInputElement>(null);

  const [term, setTerm] = useState("");
  const [debounced, setDebounced] = useState("");
  const [semantic, setSemantic] = useState(true);
  const [results, setResults] = useState<CandidateListItemDto[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const reqId = useRef(0);

  // Debounce the query.
  useEffect(() => {
    const id = window.setTimeout(() => setDebounced(term.trim()), 200);
    return () => window.clearTimeout(id);
  }, [term]);

  // Run the search (race-guarded — only the latest response wins). cmdk owns the
  // highlight/keyboard nav over the results below; we just feed it the rows.
  useEffect(() => {
    if (!debounced) {
      setResults([]);
      setTotal(0);
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
        setTotal(res.total);
      })
      .catch(() => {
        if (ticket === reqId.current) {
          setResults([]);
          setTotal(0);
        }
      })
      .finally(() => {
        if (ticket === reqId.current) setLoading(false);
      });
  }, [debounced, semantic]);

  const select = useCallback(
    (c: CandidateListItemDto) => {
      onClose();
      router.push(`/candidates?open=${encodeURIComponent(c.id)}`);
    },
    [onClose, router],
  );

  return (
    <Dialog.Root
      open
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
    >
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-ink/40 motion-safe:animate-[fade_140ms_ease-out] sm:backdrop-blur-sm" />
        {/* pointer-events-none so a click on the empty area falls through to the
            Overlay → Radix dismisses via interact-outside. */}
        <div className="pointer-events-none fixed inset-0 z-50 flex items-start justify-center p-4 sm:pt-[12vh]">
          <Dialog.Content
            aria-label="Search candidates"
            className={cn(
              "pointer-events-auto relative w-full max-w-2xl outline-none",
              "motion-safe:animate-[popIn_140ms_ease-out]",
            )}
          >
            <Dialog.Title className="sr-only">Search candidates</Dialog.Title>
            {/* cmdk owns arrow/Enter/Home/End nav + aria-activedescendant. We feed it
                server results, so disable its built-in filtering (shouldFilter). */}
            <Command
              shouldFilter={false}
              label="Search candidates"
              className="flex max-h-[70vh] w-full flex-col overflow-hidden rounded-lg border border-line bg-surface shadow-lg ring-1 ring-ink/5"
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
                  {semantic ? (
                    <SparkleIcon className="h-4 w-4" />
                  ) : (
                    <SearchIcon className="h-4 w-4" />
                  )}
                </span>
                <Command.Input
                  ref={inputRef}
                  autoFocus
                  value={term}
                  onValueChange={setTerm}
                  placeholder={
                    semantic
                      ? "Describe who you're looking for — e.g. ICU nurses with a Gulf visa"
                      : "Search name, skill, role…"
                  }
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
              <Command.List className="min-h-0 flex-1 overflow-y-auto p-2">
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
                              <SparkleIcon
                                className="h-3.5 w-3.5 shrink-0 text-brand"
                                aria-hidden
                              />
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
                      No candidates match “
                      <span className="font-medium text-ink">{debounced}</span>”.
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
                      {total > results.length
                        ? `Top ${results.length} of ${total} — keep typing to narrow`
                        : `${results.length} ${results.length === 1 ? "candidate" : "candidates"}`}
                    </p>
                    {results.map((c) => {
                      const subtitle =
                        [c.currentTitle, c.currentCompany].filter(Boolean).join(" @ ") ||
                        c.location ||
                        "—";
                      return (
                        <Command.Item
                          key={c.id}
                          value={c.id}
                          onSelect={() => select(c)}
                          className={cn(
                            "group flex w-full cursor-pointer items-start gap-3 rounded-md py-2 pl-2.5 pr-3 text-left outline-none transition",
                            "data-[selected=true]:bg-subtle",
                          )}
                        >
                          <span
                            className={cn(
                              "mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-sm font-semibold transition",
                              "bg-brand-tint text-brand",
                              "group-data-[selected=true]:bg-brand group-data-[selected=true]:text-brand-fg",
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
                              "mt-2 h-4 w-4 shrink-0 text-faint opacity-0 transition",
                              "group-data-[selected=true]:opacity-100",
                            )}
                            aria-hidden
                          />
                        </Command.Item>
                      );
                    })}
                  </>
                )}
              </Command.List>

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
            </Command>
          </Dialog.Content>
        </div>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
