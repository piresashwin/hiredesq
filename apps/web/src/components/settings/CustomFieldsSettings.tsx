"use client";

import { useCallback, useEffect, useState } from "react";
import type {
  CreateCustomFieldInput,
  CustomFieldDefinitionDto,
  CustomFieldType,
} from "@hiredesq/shared";
import { cn } from "@/lib/cn";
import { api, ApiError } from "@/lib/api";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { TagInput } from "@/components/ui/TagInput";
import { useToast } from "@/components/ui/Toast";
import { PlusIcon, TrashIcon } from "@/components/ui/Icon";

// Settings → Candidate fields. Workspace-level config for the extra fields shown on
// every candidate's Personal-details tab. Owner-only to mutate (enforced server-side,
// CLAUDE.md §1); members can view the page but writes 403. Definitions are config —
// the per-candidate values live on the candidate, keyed by definition id.

const TYPE_LABELS: Record<CustomFieldType, string> = {
  text: "Text",
  number: "Number",
  date: "Date",
  select: "Dropdown",
  boolean: "Yes / No",
};

const TYPE_ORDER: CustomFieldType[] = ["text", "number", "date", "select", "boolean"];

export function CustomFieldsSettings() {
  const { toast } = useToast();
  const [fields, setFields] = useState<CustomFieldDefinitionDto[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      setFields(await api.listCustomFields());
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : "We couldn't load your custom fields. Try again.",
      );
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-line bg-canvas/95 px-4 py-4 backdrop-blur sm:px-6 lg:px-8">
        <h1 className="text-h1 text-ink">Candidate fields</h1>
        <p className="mt-0.5 text-sm text-muted">
          Add your own fields to every candidate — they appear on the Personal details tab.
        </p>
      </div>

      <div className="mx-auto w-full max-w-3xl flex-1 space-y-8 px-4 py-6 sm:px-6 sm:py-8 lg:px-8">
        {error ? (
          <div className="rounded-md border border-line bg-surface p-6 text-center">
            <p className="text-sm text-ink">{error}</p>
            <Button variant="secondary" size="sm" className="mt-3" onClick={() => void load()}>
              Try again
            </Button>
          </div>
        ) : fields === null ? (
          <div className="space-y-2" aria-hidden>
            {[0, 1, 2].map((i) => (
              <div key={i} className="h-14 rounded-md border border-line bg-subtle/40" />
            ))}
          </div>
        ) : (
          <>
            <FieldList
              fields={fields}
              onChanged={(next) => setFields(next)}
              onError={(m) => toast(m, "error")}
            />
            <AddFieldForm
              onCreated={(created) => {
                setFields((cur) => [...(cur ?? []), created]);
                toast(`"${created.label}" added.`, "success");
              }}
              onError={(m) => toast(m, "error")}
            />
          </>
        )}
      </div>
    </div>
  );
}

function FieldList({
  fields,
  onChanged,
  onError,
}: {
  fields: CustomFieldDefinitionDto[];
  onChanged: (next: CustomFieldDefinitionDto[]) => void;
  onError: (message: string) => void;
}) {
  const [confirmDelete, setConfirmDelete] = useState<CustomFieldDefinitionDto | null>(null);
  const [deleting, setDeleting] = useState(false);

  async function onConfirmDelete() {
    if (!confirmDelete) return;
    setDeleting(true);
    try {
      await api.deleteCustomField(confirmDelete.id);
      onChanged(fields.filter((f) => f.id !== confirmDelete.id));
      setConfirmDelete(null);
    } catch (err) {
      onError(err instanceof ApiError ? err.message : "Couldn't delete that field.");
    } finally {
      setDeleting(false);
    }
  }

  if (fields.length === 0) {
    return (
      <p className="rounded-md border border-dashed border-line py-10 text-center text-sm text-muted">
        No custom fields yet. Add one below — it&apos;ll show on every candidate.
      </p>
    );
  }

  return (
    <>
      <ul className="space-y-2">
        {fields.map((field) => (
          <FieldRow
            key={field.id}
            field={field}
            onUpdated={(next) => onChanged(fields.map((f) => (f.id === next.id ? next : f)))}
            onDelete={() => setConfirmDelete(field)}
            onError={onError}
          />
        ))}
      </ul>

      <Modal
        open={confirmDelete !== null}
        onClose={() => setConfirmDelete(null)}
        title="Delete this field?"
        tone="danger"
        description={
          <>
            This removes <span className="font-medium text-ink">{confirmDelete?.label}</span> from
            every candidate. Values already entered for it are discarded. This can&apos;t be undone.
          </>
        }
      >
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={() => setConfirmDelete(null)} disabled={deleting}>
            Keep field
          </Button>
          <Button variant="destructive" onClick={() => void onConfirmDelete()} disabled={deleting}>
            {deleting ? "Deleting…" : "Delete field"}
          </Button>
        </div>
      </Modal>
    </>
  );
}

function FieldRow({
  field,
  onUpdated,
  onDelete,
  onError,
}: {
  field: CustomFieldDefinitionDto;
  onUpdated: (next: CustomFieldDefinitionDto) => void;
  onDelete: () => void;
  onError: (message: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [label, setLabel] = useState(field.label);
  const [options, setOptions] = useState<string[]>(field.options);
  const [saving, setSaving] = useState(false);

  async function onSave() {
    const trimmed = label.trim();
    if (!trimmed) return onError("A field needs a name.");
    if (field.type === "select" && options.length === 0) {
      return onError("A dropdown needs at least one option.");
    }
    setSaving(true);
    try {
      const next = await api.updateCustomField(field.id, {
        label: trimmed,
        ...(field.type === "select" ? { options } : {}),
      });
      onUpdated(next);
      setEditing(false);
    } catch (err) {
      onError(err instanceof ApiError ? err.message : "Couldn't save that field.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <li className="rounded-md border border-line bg-surface p-3">
      {editing ? (
        <div className="space-y-3">
          <div className="flex flex-wrap items-end gap-2">
            <label className="flex-1 text-label text-muted">
              Field name
              <input
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                maxLength={60}
                className="mt-1 h-9 w-full rounded-sm border border-line bg-surface px-2 text-body text-ink transition focus:border-brand"
              />
            </label>
            <span className="rounded-full bg-subtle px-2 py-1 text-label text-muted">
              {TYPE_LABELS[field.type]}
            </span>
          </div>
          {field.type === "select" ? (
            <TagInput
              label="Options"
              value={options}
              onChange={setOptions}
              placeholder="Add an option and press Enter"
            />
          ) : null}
          <div className="flex justify-end gap-2">
            <Button
              variant="secondary"
              size="sm"
              onClick={() => {
                setLabel(field.label);
                setOptions(field.options);
                setEditing(false);
              }}
              disabled={saving}
            >
              Cancel
            </Button>
            <Button variant="primary" size="sm" onClick={() => void onSave()} disabled={saving}>
              {saving ? "Saving…" : "Save"}
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex items-center gap-3">
          <div className="min-w-0 flex-1">
            <p className="truncate text-body font-medium text-ink">{field.label}</p>
            <p className="truncate text-sm text-muted">
              {TYPE_LABELS[field.type]}
              {field.type === "select" && field.options.length > 0 ? (
                <span className="text-faint"> · {field.options.join(", ")}</span>
              ) : null}
            </p>
          </div>
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="rounded-sm px-2 py-1 text-sm font-medium text-brand transition hover:bg-brand-tint"
          >
            Edit
          </button>
          <button
            type="button"
            onClick={onDelete}
            aria-label={`Delete ${field.label}`}
            className="rounded-sm p-1.5 text-faint transition hover:bg-danger-tint hover:text-danger"
          >
            <TrashIcon className="h-4 w-4" />
          </button>
        </div>
      )}
    </li>
  );
}

function AddFieldForm({
  onCreated,
  onError,
}: {
  onCreated: (created: CustomFieldDefinitionDto) => void;
  onError: (message: string) => void;
}) {
  const [label, setLabel] = useState("");
  const [type, setType] = useState<CustomFieldType>("text");
  const [options, setOptions] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  function reset() {
    setLabel("");
    setType("text");
    setOptions([]);
  }

  async function onAdd() {
    const trimmed = label.trim();
    if (!trimmed) return onError("Give the field a name.");
    if (type === "select" && options.length === 0) {
      return onError("Add at least one option for a dropdown.");
    }
    setSaving(true);
    try {
      const input: CreateCustomFieldInput = {
        label: trimmed,
        type,
        ...(type === "select" ? { options } : {}),
      };
      onCreated(await api.createCustomField(input));
      reset();
    } catch (err) {
      onError(err instanceof ApiError ? err.message : "Couldn't add that field.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="rounded-md border border-line bg-surface p-5">
      <h2 className="text-body font-semibold text-ink">Add a field</h2>
      <p className="mt-0.5 text-sm text-muted">
        Choose a name and a type. Dropdown fields let recruiters pick from a fixed list.
      </p>
      <div className="mt-3 space-y-3">
        <div className="flex flex-wrap gap-2">
          <label className="flex-1 text-label text-muted">
            Field name
            <input
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              maxLength={60}
              placeholder="e.g. Notice period"
              className="mt-1 h-9 w-full rounded-sm border border-line bg-surface px-2 text-body text-ink placeholder:text-faint transition focus:border-brand"
            />
          </label>
          <label className="text-label text-muted">
            Type
            <select
              value={type}
              onChange={(e) => setType(e.target.value as CustomFieldType)}
              className="mt-1 h-9 w-full rounded-sm border border-line bg-surface px-2 text-body text-ink transition focus:border-brand"
            >
              {TYPE_ORDER.map((t) => (
                <option key={t} value={t}>
                  {TYPE_LABELS[t]}
                </option>
              ))}
            </select>
          </label>
        </div>
        {type === "select" ? (
          <TagInput
            label="Options"
            value={options}
            onChange={setOptions}
            placeholder="Add an option and press Enter"
            hint="The choices a recruiter can pick from."
          />
        ) : null}
        <div className="flex justify-end">
          <Button
            variant="primary"
            size="sm"
            onClick={() => void onAdd()}
            disabled={saving || !label.trim()}
            className={cn(saving && "opacity-80")}
          >
            <PlusIcon className="h-4 w-4" />
            {saving ? "Adding…" : "Add field"}
          </Button>
        </div>
      </div>
    </div>
  );
}
