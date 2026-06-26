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
      subject: "Reset your Hiredesq password",
      html: resetHtml(resetUrl),
      text: resetText(resetUrl),
    });
    return { sent: true };
  }
}

function resetHtml(resetUrl: string): string {
  return [
    `<div style="font-family:system-ui,-apple-system,sans-serif;max-width:480px;margin:0 auto">`,
    `<h2 style="color:#111">Reset your password</h2>`,
    `<p>We received a request to reset your Hiredesq password. Click below to choose a new one. This link expires in 1 hour.</p>`,
    `<p><a href="${resetUrl}" style="display:inline-block;background:#111;color:#fff;padding:10px 18px;border-radius:8px;text-decoration:none">Reset password</a></p>`,
    `<p style="color:#666;font-size:13px">If you didn't request this, you can safely ignore this email.</p>`,
    `</div>`,
  ].join("");
}

function resetText(resetUrl: string): string {
  return [
    "Reset your Hiredesq password",
    "",
    "We received a request to reset your password. Open the link below to choose a new one (expires in 1 hour):",
    resetUrl,
    "",
    "If you didn't request this, you can safely ignore this email.",
  ].join("\n");
}
