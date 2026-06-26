import { Injectable } from "@nestjs/common";
import {
  MailService as CoreMailService,
  type MailSendResult,
  type MagicLinkEmail,
  type PasswordResetEmail,
  type WelcomeEmail,
} from "@hiredesq/core";

/**
 * Nest provider wrapping the framework-free @hiredesq/core MailService (the actual
 * email logic + Resend client live in core — CLAUDE.md → Architecture). This is a
 * thin DI seam: it owns the singleton core instance and forwards calls. It logs
 * nothing — neither the secret key nor the reset token (§2/§6); the caller decides
 * what (non-PII) to log based on the returned result.
 */
@Injectable()
export class MailService {
  private readonly mail = new CoreMailService();

  /** True when Resend is configured; false → inert (dev). */
  get configured(): boolean {
    return this.mail.configured;
  }

  sendPasswordResetEmail(email: PasswordResetEmail): Promise<MailSendResult> {
    return this.mail.sendPasswordResetEmail(email);
  }

  sendMagicLinkEmail(email: MagicLinkEmail): Promise<MailSendResult> {
    return this.mail.sendMagicLinkEmail(email);
  }

  sendWelcomeEmail(email: WelcomeEmail): Promise<MailSendResult> {
    return this.mail.sendWelcomeEmail(email);
  }
}
