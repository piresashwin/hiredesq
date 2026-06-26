"use client";

import { useRef, useState } from "react";
import { cn } from "@/lib/cn";
import { CloseIcon } from "@/components/ui/Icon";

// A labelled tag/chip input (skills-style) for free-text lists like required
// nationalities and licences (§2C, F4). Keyboard-first: type a value and press
// Enter or comma to add; Backspace on an empty field removes the last tag; each
// chip has its own keyboard-operable remove button (a11y §10). Values are
// trimmed and de-duplicated (case-insensitive).

export function TagInput({
  label,
  value,
  onChange,
  placeholder = "Type and press Enter",
  hint,
  id,
}: {
  label: string;
  value: string[];
  onChange: (next: string[]) => void;
  placeholder?: string;
  hint?: string;
  id?: string;
}) {
  const [draft, setDraft] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const fieldId = id ?? label.toLowerCase().replace(/\s+/g, "-");
  const hintId = hint ? `${fieldId}-hint` : undefined;

  function addTag(raw: string) {
    const next = raw.trim();
    if (!next) return;
    const exists = value.some((v) => v.toLowerCase() === next.toLowerCase());
    if (!exists) onChange([...value, next]);
    setDraft("");
  }

  function removeAt(index: number) {
    onChange(value.filter((_, i) => i !== index));
  }

  return (
    <div className="space-y-1.5">
      <label htmlFor={fieldId} className="block text-label text-muted">
        {label}
      </label>
      <div
        className={cn(
          "flex min-h-10 flex-wrap items-center gap-1.5 rounded-sm border border-line bg-surface px-2 py-1.5",
          "transition focus-within:border-brand",
        )}
        onClick={() => inputRef.current?.focus()}
      >
        {value.map((tag, i) => (
          <span
            key={tag}
            className="inline-flex items-center gap-1 rounded-sm bg-subtle px-1.5 py-0.5 text-label font-medium text-ink"
          >
            {tag}
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                removeAt(i);
              }}
              aria-label={`Remove ${tag}`}
              className="rounded-sm text-muted transition hover:text-danger"
            >
              <CloseIcon className="h-3 w-3" />
            </button>
          </span>
        ))}
        <input
          ref={inputRef}
          id={fieldId}
          type="text"
          value={draft}
          aria-describedby={hintId}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === ",") {
              e.preventDefault();
              addTag(draft);
            } else if (e.key === "Backspace" && draft === "" && value.length > 0) {
              removeAt(value.length - 1);
            }
          }}
          onBlur={() => addTag(draft)}
          placeholder={value.length === 0 ? placeholder : ""}
          className="h-6 min-w-[8rem] flex-1 bg-transparent text-body text-ink outline-none placeholder:text-faint"
        />
      </div>
      {hint ? (
        <p id={hintId} className="text-sm text-muted">
          {hint}
        </p>
      ) : null}
    </div>
  );
}
