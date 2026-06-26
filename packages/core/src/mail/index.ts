import { Resend } from "resend";

/**
 * Transactional email — framework-free domain adapter (CLAUDE.md → Architecture:
 * core is pure, no Prisma/NestJS/AI import; `resend` + reading process.env ARE
 * allowed). apps/api wraps this in a Nest provider.
 *
 * INERT UNTIL CONFIGURED — mirrors the billing/Stripe pattern: if RESEND_API_KEY
 * is unset/empty we DON'T construct or call Resend; `sendPasswordResetEmail`
 * returns `{ sent: false }` so the caller can log the link in dev (a key-less
 * local setup stays testable). The API key is a secret and the reset token is PII
 * — NEITHER is ever logged here (§2/§6); this module logs nothing at all.
 */

/** Result of an attempted send — `sent:false` means the adapter was inert (no key). */
export interface MailSendResult {
  sent: boolean;
}

export interface PasswordResetEmail {
  to: string;
  /** Full reset URL including the raw token — never logged when a key is set. */
  resetUrl: string;
}

export interface MagicLinkEmail {
  to: string;
  /** The recipient's own first name for the greeting (optional). Their own name,
   * not candidate PII — but still never logged by this module (§2/§6). */
  firstName?: string;
  /** Full login URL including the raw token — never logged when a key is set. */
  magicUrl: string;
}

export interface WelcomeEmail {
  to: string;
  /** The recipient's own first name for the greeting (optional). Their own name,
   * not candidate PII — but still never logged by this module (§2). */
  firstName?: string;
  /** Base app URL the "open your desk" CTA points at. */
  appUrl: string;
}

const DEFAULT_FROM = "Hiredesq <noreply@hiredesq.com>";

export class MailService {
  private client?: Resend;

  private get apiKey(): string | undefined {
    const key = process.env.RESEND_API_KEY;
    return key && key.trim() ? key : undefined;
  }

  private from(): string {
    const from = process.env.RESEND_FROM;
    return from && from.trim() ? from : DEFAULT_FROM;
  }

  /** True when Resend is configured; otherwise the adapter is dev/inert. */
  get configured(): boolean {
    return this.apiKey !== undefined;
  }

  private resend(): Resend {
    if (!this.client) {
      // Only reached when configured() is true.
      this.client = new Resend(this.apiKey);
    }
    return this.client;
  }

  /**
   * Send the password-reset email. When Resend isn't configured, returns
   * `{ sent: false }` WITHOUT touching the provider — the caller (dev only) may
   * then log the link. Never logs the key or the token.
   */
  async sendPasswordResetEmail({ to, resetUrl }: PasswordResetEmail): Promise<MailSendResult> {
    if (!this.configured) {
      return { sent: false };
    }

    await this.resend().emails.send({
      from: this.from(),
      to,
      subject: "Let's get you back into Hiredesq",
      html: resetHtml(resetUrl),
      text: resetText(resetUrl),
    });
    return { sent: true };
  }

  /**
   * Send the passwordless-login (magic-link) email. Same inert-without-a-key
   * contract as the reset email — returns `{ sent: false }` without touching the
   * provider so the caller (dev only) can log the link. Never logs the key, the
   * token, or the recipient (§2/§6).
   */
  async sendMagicLinkEmail({ to, firstName, magicUrl }: MagicLinkEmail): Promise<MailSendResult> {
    if (!this.configured) {
      return { sent: false };
    }

    await this.resend().emails.send({
      from: this.from(),
      to,
      subject: "Your Hiredesq login link",
      html: magicHtml(firstName, magicUrl),
      text: magicText(firstName, magicUrl),
    });
    return { sent: true };
  }

  /**
   * Send the welcome email on signup. Same inert-without-a-key contract as the
   * reset email; never logs the recipient or their name (§2). Best-effort — the
   * caller fires it after the signup transaction commits and swallows failures
   * so a mail hiccup never fails an account creation.
   */
  async sendWelcomeEmail({ to, firstName, appUrl }: WelcomeEmail): Promise<MailSendResult> {
    if (!this.configured) {
      return { sent: false };
    }

    await this.resend().emails.send({
      from: this.from(),
      to,
      subject: "Your Hiredesq desk is ready",
      html: welcomeHtml(firstName, appUrl),
      text: welcomeText(firstName, appUrl),
    });
    return { sent: true };
  }
}

/* ──────────────────────────────────────────────────────────────────────────
 * Email templates — branded transactional chrome.
 *
 * Hand-rolled, inline-styled, table-based HTML (the only thing that renders
 * reliably across Gmail / Outlook / Apple Mail — no external CSS, no web fonts,
 * no flexbox/grid). Raw hex is intentional: these strings ship outside the web
 * app, so Tailwind tokens / CSS vars aren't available. The hexes mirror the
 * design-system palette one-for-one (globals.css): brand teal-green, warm
 * canvas, ink text. Light-mode only — email dark-mode handling is unreliable,
 * so we hold high contrast instead. Copy follows the brand voice: calm, warm,
 * plain, "you", no exclamation, no vendor-speak.
 * ────────────────────────────────────────────────────────────────────────── */

const PALETTE = {
  ink: "#1a1a2e",
  canvas: "#f7f6f3",
  surface: "#ffffff",
  line: "#e4e1da",
  muted: "#6b6b78",
  brand: "#2f6f5e",
  brandHover: "#255a4c",
  brandTint: "#e9f1ee",
} as const;

const FONT = "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";

/**
 * Brand logo for the email header. Email clients (Gmail, Outlook, Yahoo) don't
 * reliably render inline SVG or data: URIs, so the logo must be a hosted raster
 * (PNG) referenced by an absolute https URL — set EMAIL_LOGO_URL in prod (e.g.
 * https://hiredesq.com/brand/email-logo.png). When it's unset (local/dev, or before
 * the asset is hosted), we fall back to the text wordmark so the header is never a
 * broken image. `alt` carries the brand name for clients that block images by default.
 */
function logoHeaderRow(): string {
  const url = process.env.EMAIL_LOGO_URL?.trim();
  const inner = url
    ? `<img src="${url}" alt="Hiredesq" height="32" style="display:block;border:0;outline:none;text-decoration:none;height:32px;width:auto;max-width:200px"/>`
    : `<span style="font-size:22px;font-weight:700;letter-spacing:-0.01em;color:${PALETTE.ink}">Hire<span style="color:${PALETTE.brand}">desq</span></span>`;
  return `<tr><td style="padding:0 4px 20px">${inner}</td></tr>`;
}

/**
 * Shared branded shell every transactional email pours into — logo header,
 * white card on the warm canvas, and the footer signoff. New emails call this
 * with their own `bodyHtml` so the chrome stays byte-identical across templates.
 */
function emailShell(opts: { preheader: string; bodyHtml: string }): string {
  const { preheader, bodyHtml } = opts;
  return [
    `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"/>`,
    `<meta name="viewport" content="width=device-width,initial-scale=1"/>`,
    `<meta name="color-scheme" content="light"/></head>`,
    `<body style="margin:0;padding:0;background:${PALETTE.canvas};font-family:${FONT};-webkit-font-smoothing:antialiased">`,
    // Hidden preview text (the inbox snippet) — never the actual content.
    `<div style="display:none;max-height:0;overflow:hidden;opacity:0">${preheader}</div>`,
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${PALETTE.canvas}"><tr><td align="center" style="padding:32px 16px">`,
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:480px">`,
    // Logo: hosted PNG via EMAIL_LOGO_URL, falling back to the text wordmark (brand-identity.md).
    logoHeaderRow(),
    // Card.
    `<tr><td style="background:${PALETTE.surface};border:1px solid ${PALETTE.line};border-radius:14px;padding:32px 32px 28px">`,
    bodyHtml,
    `</td></tr>`,
    // Footer.
    `<tr><td style="padding:24px 4px 0;color:${PALETTE.muted};font-size:13px;line-height:1.6">`,
    `<div style="color:${PALETTE.ink};font-weight:600">You place people. We'll handle the mess.</div>`,
    `<div style="margin-top:4px">Hiredesq — a clarity engine for recruiters.</div>`,
    `<div style="margin-top:12px;color:${PALETTE.muted}">This is an automated message, so replies aren't monitored.</div>`,
    `</td></tr>`,
    `</table></td></tr></table></body></html>`,
  ].join("");
}

function resetHtml(resetUrl: string): string {
  const bodyHtml = [
    `<h1 style="margin:0 0 16px;font-size:20px;line-height:1.3;font-weight:700;color:${PALETTE.ink}">Let's get you back in</h1>`,
    `<p style="margin:0 0 16px;font-size:15px;line-height:1.6;color:${PALETTE.ink}">Someone asked to reset the password for your Hiredesq account. If that was you, set a new one below. The link works for the next hour.</p>`,
    // Bulletproof-ish CTA — brand green (primary action; terracotta is reserved
    // for win/conversion moments, design-system.md). Padded anchor for Outlook.
    `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:8px 0 20px"><tr><td style="border-radius:10px;background:${PALETTE.brand}">`,
    `<a href="${resetUrl}" style="display:inline-block;padding:13px 24px;font-size:15px;font-weight:600;color:#ffffff;text-decoration:none;border-radius:10px">Set a new password</a>`,
    `</td></tr></table>`,
    `<p style="margin:0 0 8px;font-size:13px;line-height:1.6;color:${PALETTE.muted}">Button not working? Paste this link into your browser:</p>`,
    `<p style="margin:0 0 20px;font-size:13px;line-height:1.6;word-break:break-all"><a href="${resetUrl}" style="color:${PALETTE.brand}">${resetUrl}</a></p>`,
    `<p style="margin:0;font-size:13px;line-height:1.6;color:${PALETTE.muted}">If this wasn't you, you can ignore this email. Your password won't change until you set a new one.</p>`,
  ].join("");
  return emailShell({
    preheader: "Set a new password — the link works for the next hour.",
    bodyHtml,
  });
}

function resetText(resetUrl: string): string {
  return [
    "Let's get you back in",
    "",
    "Someone asked to reset the password for your Hiredesq account.",
    "If that was you, open the link below to set a new one. It works for the next hour:",
    "",
    resetUrl,
    "",
    "If this wasn't you, you can ignore this email. Your password won't change until you set a new one.",
    "",
    "—",
    "You place people. We'll handle the mess.",
    "Hiredesq — a clarity engine for recruiters.",
    "This is an automated message, so replies aren't monitored.",
  ].join("\n");
}

function magicHtml(firstName: string | undefined, magicUrl: string): string {
  const name = firstName?.trim() ? escapeHtml(firstName.trim()) : null;
  const greeting = name ? `Welcome back, ${name}` : "Welcome back";
  const bodyHtml = [
    `<h1 style="margin:0 0 16px;font-size:20px;line-height:1.3;font-weight:700;color:${PALETTE.ink}">${greeting}</h1>`,
    `<p style="margin:0 0 16px;font-size:15px;line-height:1.6;color:${PALETTE.ink}">Tap the button below and you're straight back into Hiredesq — no password needed. The link works for the next 15 minutes.</p>`,
    `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:8px 0 20px"><tr><td style="border-radius:10px;background:${PALETTE.brand}">`,
    `<a href="${magicUrl}" style="display:inline-block;padding:13px 24px;font-size:15px;font-weight:600;color:#ffffff;text-decoration:none;border-radius:10px">Sign in to Hiredesq</a>`,
    `</td></tr></table>`,
    `<p style="margin:0 0 8px;font-size:13px;line-height:1.6;color:${PALETTE.muted}">Button not working? Paste this link into your browser:</p>`,
    `<p style="margin:0 0 20px;font-size:13px;line-height:1.6;word-break:break-all"><a href="${magicUrl}" style="color:${PALETTE.brand}">${magicUrl}</a></p>`,
    `<p style="margin:0;font-size:13px;line-height:1.6;color:${PALETTE.muted}">If this wasn't you, you can ignore this email. Nothing changes until the link is used.</p>`,
  ].join("");
  return emailShell({
    preheader: "Your login link — works for the next 15 minutes, no password needed.",
    bodyHtml,
  });
}

function magicText(firstName: string | undefined, magicUrl: string): string {
  const name = firstName?.trim();
  return [
    name ? `Welcome back, ${name}` : "Welcome back",
    "",
    "Tap the link below and you're straight back into Hiredesq — no password needed.",
    "It works for the next 15 minutes:",
    "",
    magicUrl,
    "",
    "If this wasn't you, you can ignore this email. Nothing changes until the link is used.",
    "",
    "—",
    "You place people. We'll handle the mess.",
    "Hiredesq — a clarity engine for recruiters.",
    "This is an automated message, so replies aren't monitored.",
  ].join("\n");
}

/** Minimal HTML-escape — the name is the user's own, but a stray `<`/`&` shouldn't break markup. */
function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function welcomeHtml(firstName: string | undefined, appUrl: string): string {
  const name = firstName?.trim() ? escapeHtml(firstName.trim()) : null;
  const greeting = name ? `Welcome, ${name}` : "Welcome to Hiredesq";
  const bodyHtml = [
    `<h1 style="margin:0 0 16px;font-size:20px;line-height:1.3;font-weight:700;color:${PALETTE.ink}">${greeting}</h1>`,
    `<p style="margin:0 0 16px;font-size:15px;line-height:1.6;color:${PALETTE.ink}">Your desk is set up. Here's the one thing worth doing first.</p>`,
    `<p style="margin:0 0 20px;font-size:15px;line-height:1.6;color:${PALETTE.ink}">Forward your messiest CV, a WhatsApp export, or a folder of resumes. In about two minutes it comes back as clean, searchable candidates — no typing, no setup.</p>`,
    `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:4px 0 20px"><tr><td style="border-radius:10px;background:${PALETTE.brand}">`,
    `<a href="${appUrl}" style="display:inline-block;padding:13px 24px;font-size:15px;font-weight:600;color:#ffffff;text-decoration:none;border-radius:10px">Open your desk</a>`,
    `</td></tr></table>`,
    `<p style="margin:0;font-size:15px;line-height:1.6;color:${PALETTE.ink}">Most recruiters are sitting on a better book of business than they think. Let's go find yours.</p>`,
  ].join("");
  return emailShell({
    preheader: "Forward your first messy CV — it comes back clean and searchable in about two minutes.",
    bodyHtml,
  });
}

function welcomeText(firstName: string | undefined, appUrl: string): string {
  const name = firstName?.trim();
  return [
    name ? `Welcome, ${name}` : "Welcome to Hiredesq",
    "",
    "Your desk is set up. Here's the one thing worth doing first.",
    "",
    "Forward your messiest CV, a WhatsApp export, or a folder of resumes. In about two minutes it comes back as clean, searchable candidates — no typing, no setup.",
    "",
    `Open your desk: ${appUrl}`,
    "",
    "Most recruiters are sitting on a better book of business than they think. Let's go find yours.",
    "",
    "—",
    "You place people. We'll handle the mess.",
    "Hiredesq — a clarity engine for recruiters.",
    "This is an automated message, so replies aren't monitored.",
  ].join("\n");
}
