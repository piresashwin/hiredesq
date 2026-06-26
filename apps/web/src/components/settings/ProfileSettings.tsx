"use client";

import { useEffect, useRef, useState } from "react";
import type { AuthUserDto, ThemePreference, TwoFactorSetupDto } from "@hiredesq/shared";
import { api, ApiError } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useTheme } from "@/lib/theme";
import { useToast } from "@/components/ui/Toast";
import { cn } from "@/lib/cn";
import { Button } from "@/components/ui/Button";
import { Chip } from "@/components/ui/Badge";
import { Field } from "@/components/ui/Field";
import { Select, type SelectOption } from "@/components/ui/Select";
import { Modal } from "@/components/ui/Modal";
import { Tabs } from "@/components/ui/Tabs";
import { UploadCloudIcon, SparkleIcon, LockIcon, TrashIcon } from "@/components/ui/Icon";

// Profile & account settings (design-system §6, reached from the profile menu).
// Two-column layout: a left identity panel (photo + name + email + role) and a
// right pill-tabbed details area — Profile, Security, Preferences. Email is the
// immutable sign-in identity; theme/timezone/currency sync to the account.

const MAX_AVATAR_BYTES = 2 * 1024 * 1024;
const AVATAR_TYPES = ["image/png", "image/jpeg", "image/webp"];

const THEMES: { value: ThemePreference; label: string }[] = [
  { value: "light", label: "Light" },
  { value: "dark", label: "Dark" },
  { value: "system", label: "System" },
];

// A curated set of common currencies (ISO 4217). User-level default for new
// jobs/placements — the per-record currency stays authoritative (CLAUDE.md §3).
const CURRENCIES: SelectOption[] = [
  { value: "USD", label: "USD — US Dollar" },
  { value: "EUR", label: "EUR — Euro" },
  { value: "GBP", label: "GBP — British Pound" },
  { value: "AED", label: "AED — UAE Dirham" },
  { value: "SAR", label: "SAR — Saudi Riyal" },
  { value: "QAR", label: "QAR — Qatari Riyal" },
  { value: "KWD", label: "KWD — Kuwaiti Dinar" },
  { value: "BHD", label: "BHD — Bahraini Dinar" },
  { value: "OMR", label: "OMR — Omani Rial" },
  { value: "INR", label: "INR — Indian Rupee" },
  { value: "AUD", label: "AUD — Australian Dollar" },
  { value: "CAD", label: "CAD — Canadian Dollar" },
  { value: "SGD", label: "SGD — Singapore Dollar" },
  { value: "JPY", label: "JPY — Japanese Yen" },
  { value: "CNY", label: "CNY — Chinese Yuan" },
  { value: "HKD", label: "HKD — Hong Kong Dollar" },
  { value: "KRW", label: "KRW — South Korean Won" },
  { value: "MYR", label: "MYR — Malaysian Ringgit" },
  { value: "THB", label: "THB — Thai Baht" },
  { value: "IDR", label: "IDR — Indonesian Rupiah" },
  { value: "PHP", label: "PHP — Philippine Peso" },
  { value: "VND", label: "VND — Vietnamese Dong" },
  { value: "PKR", label: "PKR — Pakistani Rupee" },
];

// The browser's full IANA timezone list when available, with a small fallback for
// environments without Intl.supportedValuesOf.
function timezoneOptions(): SelectOption[] {
  const supported =
    typeof Intl !== "undefined" && "supportedValuesOf" in Intl
      ? (Intl as unknown as { supportedValuesOf: (k: string) => string[] }).supportedValuesOf("timeZone")
      : ["UTC", "America/New_York", "Europe/London", "Asia/Dubai", "Asia/Kolkata", "Asia/Singapore"];
  return supported.map((tz) => ({ value: tz, label: tz.replace(/_/g, " ") }));
}

type TabKey = "profile" | "security" | "preferences";

const TABS = [
  { key: "profile", label: "Profile" },
  { key: "security", label: "Security" },
  { key: "preferences", label: "Preferences" },
];

export function ProfileSettings() {
  const [tab, setTab] = useState<TabKey>("profile");

  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-line bg-canvas/95 px-4 py-4 backdrop-blur sm:px-6 lg:px-8">
        <h1 className="text-h1 text-ink">Profile settings</h1>
        <p className="mt-0.5 text-sm text-muted">Your photo, name, security, and preferences.</p>
      </div>
      <div className="mx-auto w-full max-w-4xl flex-1 px-4 py-6 sm:px-6 sm:py-8 lg:px-8">
        <div className="grid gap-6 lg:grid-cols-[280px_1fr]">
          <IdentityPanel />
          <Tabs variant="pill" tabs={TABS} value={tab} onChange={(k) => setTab(k as TabKey)}>
            {(active) => (
              <section className="rounded-lg border border-line bg-surface p-5">
                {active === "profile" ? <ProfileTab /> : null}
                {active === "security" ? <SecurityTab /> : null}
                {active === "preferences" ? <PreferencesTab /> : null}
              </section>
            )}
          </Tabs>
        </div>
      </div>
    </div>
  );
}

function Avatar({ name, url, className }: { name: string; url: string | null; className?: string }) {
  if (url) {
    return <img src={url} alt="" className={cn(className, "rounded-full object-cover")} />;
  }
  const initials =
    name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((p) => p[0]?.toUpperCase())
      .join("") || "?";
  return (
    <span
      className={cn(
        className,
        "flex items-center justify-center rounded-full bg-brand-tint text-display font-semibold text-brand",
      )}
    >
      {initials}
    </span>
  );
}

// ─────────────────────────── Left: identity ───────────────────────────

function IdentityPanel() {
  const { user, updateUser } = useAuth();
  const { toast } = useToast();
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  async function onPickAvatar(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ""; // allow re-picking the same file
    if (!file) return;
    if (!AVATAR_TYPES.includes(file.type)) {
      toast("Please choose a PNG, JPG, or WebP image.", "error");
      return;
    }
    if (file.size > MAX_AVATAR_BYTES) {
      toast("That image is over 2 MB — please pick a smaller one.", "error");
      return;
    }
    setUploading(true);
    try {
      const next = await api.uploadAvatar(file);
      updateUser(next);
      toast("Profile photo updated.", "success");
    } catch (err) {
      toast(err instanceof ApiError ? err.message : "Couldn't upload that photo.", "error");
    } finally {
      setUploading(false);
    }
  }

  return (
    <section
      className="flex flex-col items-center rounded-lg border border-line bg-surface p-6 text-center lg:sticky lg:top-5 lg:self-start"
      aria-label="Your account"
    >
      <Avatar name={user?.fullName ?? ""} url={user?.avatarUrl ?? null} className="h-24 w-24" />
      <input
        ref={fileRef}
        type="file"
        accept={AVATAR_TYPES.join(",")}
        onChange={(e) => void onPickAvatar(e)}
        className="hidden"
      />
      <Button
        variant="secondary"
        size="sm"
        className="mt-4"
        onClick={() => fileRef.current?.click()}
        disabled={uploading}
      >
        <UploadCloudIcon className="h-4 w-4" />
        {uploading ? "Uploading…" : "Change photo"}
      </Button>
      <p className="mt-1.5 text-label text-muted">PNG, JPG, or WebP, up to 2 MB.</p>

      <h2 className="mt-5 text-h2 text-ink">{user?.fullName || "Your name"}</h2>
      <p className="mt-0.5 break-all text-sm text-muted">{user?.email ?? ""}</p>
      {user?.role ? <Chip className="mt-3 capitalize">{user.role}</Chip> : null}
    </section>
  );
}

// ─────────────────────────── Tab: Profile ───────────────────────────

function ProfileTab() {
  const { user, updateUser } = useAuth();
  const { toast } = useToast();
  const [fullName, setFullName] = useState(user?.fullName ?? "");
  const [saving, setSaving] = useState(false);

  const dirty = fullName.trim() !== (user?.fullName ?? "") && fullName.trim().length > 0;

  async function onSave() {
    if (!dirty || saving) return;
    setSaving(true);
    try {
      const next = await api.updateProfile({ fullName: fullName.trim() });
      updateUser(next);
      toast("Profile saved.", "success");
    } catch (err) {
      toast(err instanceof ApiError ? err.message : "Couldn't save your profile.", "error");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div aria-label="Profile">
      <h3 className="text-h3 text-ink">Profile</h3>
      <p className="mt-1 text-sm text-muted">Your display name and sign-in email.</p>
      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <Field
          label="Full name"
          name="fullName"
          value={fullName}
          onChange={(e) => setFullName(e.target.value)}
          placeholder="Your name"
        />
        {/* Email is the immutable sign-in identity — read-only, with a lock affordance. */}
        <div className="relative">
          <Field
            label="Email"
            name="email"
            value={user?.email ?? ""}
            readOnly
            hint="Your sign-in email — can't be changed."
            className="bg-subtle/50 pr-9"
          />
          <LockIcon
            className="pointer-events-none absolute right-3 top-[2.35rem] h-4 w-4 text-faint"
            aria-hidden
          />
        </div>
      </div>
      <div className="mt-5 flex justify-end">
        <Button variant="primary" onClick={() => void onSave()} disabled={!dirty || saving}>
          {saving ? "Saving…" : "Save changes"}
        </Button>
      </div>
    </div>
  );
}

// ─────────────────────────── Tab: Security ───────────────────────────

function SecurityTab() {
  return (
    <div aria-label="Security" className="space-y-8">
      <ChangePassword />
      <hr className="border-line" />
      <TwoFactorRow />
      <hr className="border-line" />
      <DeleteAccountRow />
    </div>
  );
}

function ChangePassword() {
  const { toast } = useToast();
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [saving, setSaving] = useState(false);

  const tooShort = next.length > 0 && next.length < 8;
  const mismatch = confirm.length > 0 && confirm !== next;
  const valid = current.length > 0 && next.length >= 8 && next === confirm;

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!valid || saving) return;
    setSaving(true);
    try {
      await api.changePassword({ currentPassword: current, newPassword: next });
      toast("Password changed.", "success");
      setCurrent("");
      setNext("");
      setConfirm("");
    } catch (err) {
      toast(err instanceof ApiError ? err.message : "Couldn't change your password.", "error");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div>
      <h3 className="text-h3 text-ink">Change password</h3>
      <form onSubmit={(e) => void onSubmit(e)} className="mt-4 space-y-4">
        <Field
          label="Current password"
          name="currentPassword"
          type="password"
          autoComplete="current-password"
          value={current}
          onChange={(e) => setCurrent(e.target.value)}
        />
        <div className="grid gap-4 sm:grid-cols-2">
          <Field
            label="New password"
            name="newPassword"
            type="password"
            autoComplete="new-password"
            value={next}
            onChange={(e) => setNext(e.target.value)}
            error={tooShort ? "At least 8 characters." : undefined}
            hint={tooShort ? undefined : "At least 8 characters."}
          />
          <Field
            label="Confirm new password"
            name="confirmPassword"
            type="password"
            autoComplete="new-password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            error={mismatch ? "Passwords don't match." : undefined}
          />
        </div>
        <div className="flex justify-end">
          <Button type="submit" variant="primary" disabled={!valid || saving}>
            {saving ? "Changing…" : "Change password"}
          </Button>
        </div>
      </form>
    </div>
  );
}

function TwoFactorRow() {
  const { user, updateUser } = useAuth();
  const { toast } = useToast();
  const enabled = user?.twoFactorEnabled ?? false;
  const [mode, setMode] = useState<null | "setup" | "disable">(null);

  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex gap-3">
        <span className="mt-0.5 shrink-0 text-muted" aria-hidden>
          <LockIcon className="h-5 w-5" />
        </span>
        <div>
          <h3 className="flex items-center gap-2 text-h3 text-ink">
            Two-factor authentication
            {enabled ? (
              <Chip className="bg-success-tint text-money">On</Chip>
            ) : null}
          </h3>
          <p className="mt-1 text-sm text-muted">
            {enabled
              ? "You'll enter a code from your authenticator app when you sign in."
              : "Protect your account with an authenticator app (TOTP)."}
          </p>
        </div>
      </div>
      <div className="shrink-0 sm:pl-4">
        {enabled ? (
          <Button variant="secondary" size="sm" onClick={() => setMode("disable")}>
            Turn off
          </Button>
        ) : (
          <Button variant="secondary" size="sm" onClick={() => setMode("setup")}>
            Set up
          </Button>
        )}
      </div>

      {mode === "setup" ? (
        <TwoFactorSetupModal
          onClose={() => setMode(null)}
          onEnabled={(u) => {
            updateUser(u);
            toast("Two-factor authentication is on.", "success");
            setMode(null);
          }}
        />
      ) : null}
      {mode === "disable" ? (
        <TwoFactorDisableModal
          onClose={() => setMode(null)}
          onDisabled={(u) => {
            updateUser(u);
            toast("Two-factor authentication is off.", "info");
            setMode(null);
          }}
        />
      ) : null}
    </div>
  );
}

function TwoFactorSetupModal({
  onClose,
  onEnabled,
}: {
  onClose: () => void;
  onEnabled: (user: AuthUserDto) => void;
}) {
  const [setup, setSetup] = useState<TwoFactorSetupDto | null>(null);
  const [loading, setLoading] = useState(true);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Begin enrollment once when the modal opens.
  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const res = await api.setupTwoFactor();
        if (active) setSetup(res);
      } catch (err) {
        if (active) setError(err instanceof ApiError ? err.message : "Couldn't start setup.");
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  async function onVerify(e: React.FormEvent) {
    e.preventDefault();
    if (code.length < 6 || busy) return;
    setBusy(true);
    setError(null);
    try {
      onEnabled(await api.enableTwoFactor({ code: code.trim() }));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "That code didn't work.");
      setBusy(false);
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title="Set up two-factor authentication"
      description="Scan the QR code with your authenticator app, then enter the 6-digit code it shows."
    >
      {loading ? (
        <p className="text-sm text-muted">Preparing…</p>
      ) : setup ? (
        <form onSubmit={(e) => void onVerify(e)} className="space-y-4">
          <div className="flex flex-col items-center gap-3">
            <img
              src={setup.qrDataUrl}
              alt="Two-factor QR code"
              className="h-44 w-44 rounded-md border border-line bg-white p-2"
            />
            <p className="text-center text-label text-muted">
              Can&apos;t scan? Enter this key manually:
              <br />
              <span className="select-all font-mono text-sm text-ink">{setup.secret}</span>
            </p>
          </div>
          {error ? (
            <div role="alert" className="rounded-sm bg-danger-tint px-3 py-2 text-sm text-danger">
              {error}
            </div>
          ) : null}
          <Field
            label="Authentication code"
            name="totpCode"
            inputMode="numeric"
            autoComplete="one-time-code"
            autoFocus
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
            placeholder="123456"
          />
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" variant="primary" disabled={code.length < 6 || busy}>
              {busy ? "Verifying…" : "Turn on"}
            </Button>
          </div>
        </form>
      ) : (
        <div className="space-y-4">
          <div role="alert" className="rounded-sm bg-danger-tint px-3 py-2 text-sm text-danger">
            {error ?? "Couldn't start setup."}
          </div>
          <div className="flex justify-end">
            <Button variant="secondary" onClick={onClose}>
              Close
            </Button>
          </div>
        </div>
      )}
    </Modal>
  );
}

function TwoFactorDisableModal({
  onClose,
  onDisabled,
}: {
  onClose: () => void;
  onDisabled: (user: AuthUserDto) => void;
}) {
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (code.length < 6 || busy) return;
    setBusy(true);
    setError(null);
    try {
      onDisabled(await api.disableTwoFactor({ code: code.trim() }));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "That code didn't work.");
      setBusy(false);
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title="Turn off two-factor authentication"
      description="Enter a current code from your authenticator app to confirm."
    >
      <form onSubmit={(e) => void onSubmit(e)} className="space-y-4">
        {error ? (
          <div role="alert" className="rounded-sm bg-danger-tint px-3 py-2 text-sm text-danger">
            {error}
          </div>
        ) : null}
        <Field
          label="Authentication code"
          name="totpDisableCode"
          inputMode="numeric"
          autoComplete="one-time-code"
          autoFocus
          value={code}
          onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
          placeholder="123456"
        />
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" variant="destructive" disabled={code.length < 6 || busy}>
            {busy ? "Turning off…" : "Turn off"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

function DeleteAccountRow() {
  const [open, setOpen] = useState(false);

  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex gap-3">
        <span className="mt-0.5 shrink-0 text-danger" aria-hidden>
          <TrashIcon className="h-5 w-5" />
        </span>
        <div>
          <h3 className="text-h3 text-danger">Delete account</h3>
          <p className="mt-1 text-sm text-muted">
            Permanently remove your account, workspace data, and uploaded files. This can&apos;t be undone.
          </p>
        </div>
      </div>
      <div className="shrink-0 sm:pl-4">
        <Button variant="destructive" size="sm" onClick={() => setOpen(true)}>
          Delete account
        </Button>
      </div>
      {open ? <DeleteAccountModal onClose={() => setOpen(false)} /> : null}
    </div>
  );
}

function DeleteAccountModal({ onClose }: { onClose: () => void }) {
  const { user, signOut } = useAuth();
  const [confirmEmail, setConfirmEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const emailMatches =
    confirmEmail.trim().toLowerCase() === (user?.email ?? "").toLowerCase() && !!user?.email;

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!emailMatches || busy) return;
    setBusy(true);
    setError(null);
    try {
      await api.deleteAccount({
        confirmEmail: confirmEmail.trim(),
        password: password ? password : undefined,
      });
      // Tokens are now invalid server-side data is gone — clear the session + redirect.
      signOut();
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : "We couldn't delete your account. Please try again.",
      );
      setBusy(false);
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      tone="danger"
      title="Delete your account"
      description="This permanently deletes your account, the candidate data and files in any workspace you solely own, and removes you from shared workspaces. This can't be undone."
    >
      <form onSubmit={(e) => void onSubmit(e)} className="space-y-4">
        {error ? (
          <div role="alert" className="rounded-sm bg-danger-tint px-3 py-2 text-sm text-danger">
            {error}
          </div>
        ) : null}
        <Field
          label="Type your email to confirm"
          name="confirmEmail"
          type="email"
          autoComplete="off"
          value={confirmEmail}
          onChange={(e) => setConfirmEmail(e.target.value)}
          placeholder={user?.email ?? "you@agency.com"}
        />
        <Field
          label="Password"
          name="deletePassword"
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          hint="Leave blank if you sign in with Google."
        />
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" variant="destructive" disabled={!emailMatches || busy}>
            {busy ? "Deleting…" : "Delete my account"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

// ─────────────────────────── Tab: Preferences ───────────────────────────

function PreferencesTab() {
  return (
    <div aria-label="Preferences" className="space-y-8">
      <Appearance />
      <hr className="border-line" />
      <RegionPreferences />
    </div>
  );
}

function Appearance() {
  const { preference, setPreference } = useTheme();
  const { user, updateUser } = useAuth();
  const { toast } = useToast();

  async function choose(next: ThemePreference) {
    if (next === preference) return;
    setPreference(next); // instant
    try {
      const updated = await api.updateProfile({ theme: next });
      updateUser(updated);
    } catch {
      // Non-fatal: the local theme already applied; just note it didn't sync.
      if (user) toast("Theme applied, but we couldn't save it to your account.", "info");
    }
  }

  return (
    <div>
      <h3 className="flex items-center gap-2 text-h3 text-ink">
        <SparkleIcon className="h-4 w-4 text-brand" aria-hidden />
        Appearance
      </h3>
      <p className="mt-1 text-sm text-muted">
        Choose a theme. Dark mode is tuned to be easy on the eyes; “System” follows your device.
      </p>
      <div
        role="group"
        aria-label="Theme"
        className="mt-4 inline-flex rounded-md border border-line bg-surface p-0.5"
      >
        {THEMES.map((t) => (
          <button
            key={t.value}
            type="button"
            onClick={() => void choose(t.value)}
            aria-pressed={preference === t.value}
            className={cn(
              "rounded-sm px-4 py-1.5 text-body font-medium transition",
              "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-brand",
              preference === t.value ? "bg-brand-tint text-brand" : "text-muted hover:text-ink",
            )}
          >
            {t.label}
          </button>
        ))}
      </div>
    </div>
  );
}

function RegionPreferences() {
  const { user, updateUser } = useAuth();
  const { toast } = useToast();
  const [saving, setSaving] = useState<null | "timezone" | "currency">(null);
  const timezones = useRef<SelectOption[]>(timezoneOptions());

  async function save(field: "timezone" | "currency", value: string) {
    setSaving(field);
    try {
      const updated = await api.updateProfile({ [field]: value });
      updateUser(updated);
    } catch (err) {
      toast(err instanceof ApiError ? err.message : "Couldn't save that change.", "error");
    } finally {
      setSaving(null);
    }
  }

  return (
    <div>
      <h3 className="text-h3 text-ink">Region</h3>
      <p className="mt-1 text-sm text-muted">
        Used to display dates and to pre-fill the currency on new jobs and placements.
      </p>
      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <Select
          label="Timezone"
          name="timezone"
          value={user?.timezone ?? "UTC"}
          options={timezones.current}
          disabled={saving === "timezone"}
          onChange={(e) => void save("timezone", e.target.value)}
        />
        <Select
          label="Default currency"
          name="currency"
          value={user?.currency ?? "USD"}
          options={CURRENCIES}
          disabled={saving === "currency"}
          onChange={(e) => void save("currency", e.target.value)}
        />
      </div>
    </div>
  );
}
