"use client";

import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/cn";
import { CheckIcon, CloseIcon, PencilIcon } from "@/components/ui/Icon";

// Inline-editable field (design-system §6.4, Principle 6 — "trust through
// correction"). A value shows with a subtle pencil affordance; clicking edits it
// in place and commits on blur / Enter. AI-derived fields wear the AI badge
// alongside (rendered by the parent). Empty values invite a fill ("Add …").

export function EditableField({
  label,
  value,
  placeholder = "Add",
  multiline = false,
  badge,
  onSave,
}: {
  label: string;
  value: string;
  placeholder?: string;
  multiline?: boolean;
  badge?: React.ReactNode;
  /** Persists the new value; returns false to reject (caller reverts + toasts). */
  onSave: (next: string) => Promise<boolean>;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const [saving, setSaving] = useState(false);
  const inputRef = useRef<HTMLInputElement & HTMLTextAreaElement>(null);

  useEffect(() => {
    if (!editing) setDraft(value);
  }, [value, editing]);

  useEffect(() => {
    if (editing) inputRef.current?.focus();
  }, [editing]);

  async function commit() {
    const next = draft.trim();
    if (next === value.trim()) {
      setEditing(false);
      return;
    }
    setSaving(true);
    const ok = await onSave(next);
    setSaving(false);
    if (ok) setEditing(false);
    else setDraft(value);
  }

  const fieldId = `edit-${label.toLowerCase().replace(/\s+/g, "-")}`;

  // Row layout: label on the left, value (or editor) on the right — compact, so the
  // Personal-details tab packs more fields per screen (drawer feedback). Falls back to
  // stacking on very narrow widths so the value never gets crushed.
  return (
    <div className="group/field flex flex-col gap-1 py-2.5 sm:flex-row sm:items-center sm:gap-3">
      <label
        htmlFor={fieldId}
        className="flex shrink-0 items-center gap-1.5 text-label text-muted sm:w-28"
      >
        {label}
        {badge}
      </label>

      {editing ? (
        <div className="flex flex-1 items-start gap-1.5">
          {multiline ? (
            <textarea
              id={fieldId}
              ref={inputRef}
              value={draft}
              rows={2}
              disabled={saving}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Escape") setEditing(false);
              }}
              className="w-full resize-none rounded-sm border border-brand bg-surface px-2 py-1 text-body text-ink"
            />
          ) : (
            <input
              id={fieldId}
              ref={inputRef}
              value={draft}
              disabled={saving}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") void commit();
                if (e.key === "Escape") setEditing(false);
              }}
              className="h-8 w-full rounded-sm border border-brand bg-surface px-2 text-body text-ink"
            />
          )}
          <button
            type="button"
            onClick={() => void commit()}
            disabled={saving}
            aria-label={`Save ${label}`}
            className="mt-0.5 shrink-0 rounded-sm p-1 text-money transition hover:bg-success-tint"
          >
            <CheckIcon className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={() => setEditing(false)}
            aria-label={`Cancel editing ${label}`}
            className="mt-0.5 shrink-0 rounded-sm p-1 text-muted transition hover:bg-subtle"
          >
            <CloseIcon className="h-4 w-4" />
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setEditing(true)}
          className={cn(
            "-mx-2 flex flex-1 items-center justify-between gap-2 rounded-sm px-2 py-1 text-left transition hover:bg-subtle sm:justify-end sm:text-right",
          )}
        >
          <span className={cn("text-body", value ? "text-ink" : "text-faint")}>
            {value || placeholder}
          </span>
          <PencilIcon className="h-3.5 w-3.5 shrink-0 text-faint opacity-0 transition group-hover/field:opacity-100" />
        </button>
      )}
    </div>
  );
}
