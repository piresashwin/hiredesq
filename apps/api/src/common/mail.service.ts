import { Injectable } from "@nestjs/common";
import {
  MailService as CoreMailService,
  type MailSendResult,
  type PasswordResetEmail,
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
}
