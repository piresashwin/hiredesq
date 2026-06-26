import { createHash, randomBytes } from "node:crypto";
import {
  Injectable,
  Inject,
  Logger,
  BadRequestException,
  ConflictException,
  UnauthorizedException,
  NotFoundException,
} from "@nestjs/common";
import type {
  AuthResponse,
  AuthTokens,
  AuthUserDto,
  LoginResultDto,
  ThemePreference,
  TourProgress,
  TourScreen,
  TwoFactorSetupDto,
  WorkspaceRole,
} from "@hiredesq/shared";
import { countryFromTimezone } from "@hiredesq/shared";
import { Prisma } from "@hiredesq/database";
import { workspaceKey } from "@hiredesq/storage";
import { encryptField, decryptField } from "@hiredesq/core";
import { PrismaService } from "../../common/prisma.service.js";
import { StorageService } from "../../common/storage.service.js";
import { MailService } from "../../common/mail.service.js";
import { hash, verify } from "../../common/password.js";
import {
  signAccess,
  signRefresh,
  signTwoFactorChallenge,
  verifyToken,
  verifyTwoFactorChallenge,
} from "../../common/jwt.js";
import {
  generateTotpSecret,
  totpKeyUri,
  totpQrDataUrl,
  verifyTotp,
} from "../../common/totp.js";
import { exchangeGoogleCode } from "../../common/google.js";
import type {
  SignupDto,
  LoginDto,
  GoogleAuthDto,
  UpdateProfileDto,
  ChangePasswordDto,
  DeleteAccountDto,
  ForgotPasswordDto,
  ResetPasswordDto,
  RequestMagicLinkDto,
  VerifyMagicLinkDto,
  TwoFactorLoginDto,
  TwoFactorVerifyDto,
} from "./auth.dto.js";

// A Prisma transaction client (the `tx` handed to $transaction callbacks).
type Tx = Parameters<Parameters<PrismaService["$transaction"]>[0]>[0];

/** A buffered avatar image handed over by the controller (multipart). */
export interface IncomingAvatar {
  mimetype: string;
  buffer: Buffer;
}

// Signed avatar URLs live a week — long enough to outlast a session without
// being a durable public link (§1/§2).
const AVATAR_URL_TTL = 604_800;

// Reset token: random bytes, only the SHA-256 hash is stored (§6); 1-hour expiry.
const RESET_TTL_MS = 60 * 60 * 1000;

// Magic-login token: same hash-only storage as the reset token, but shorter-lived
// (15 min) — it mints a session, so the window to redeem a leaked link stays small.
const MAGIC_LINK_TTL_MS = 15 * 60 * 1000;

// Accepted avatar content types → file extension for the storage key.
const AVATAR_EXTENSIONS: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
};

// New free workspaces start with 5 AI credits, replenished daily (CLAUDE.md §4).
// Credits drive upgrade intent, not COGS.
const FREE_TIER_CREDITS = 5;

// Screens that ship with a guided tour — the allowlist for the tourProgress JSON
// column. Anything outside this set (or any non-boolean value) is dropped, so
// only clean data is ever persisted regardless of what the client sends.
const TOUR_SCREENS: TourScreen[] = ["home", "candidates", "jobs", "revenue"];

function sanitizeTourProgress(raw: unknown): TourProgress {
  const out: TourProgress = {};
  if (raw && typeof raw === "object") {
    for (const screen of TOUR_SCREENS) {
      const value = (raw as Record<string, unknown>)[screen];
      if (typeof value === "boolean") out[screen] = value;
    }
  }
  return out;
}

// Merge an incoming tour-progress patch onto the stored value: a partial update
// (one screen seen) must never wipe the rest. Both sides are sanitized first.
function mergeTourProgress(current: unknown, patch: TourProgress): TourProgress {
  return { ...sanitizeTourProgress(current), ...sanitizeTourProgress(patch) };
}

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  // Seam over the Google auth-code → identity exchange so unit tests can stub the
  // external network call; production uses the real google-auth-library implementation.
  protected resolveGoogleIdentity = exchangeGoogleCode;

  constructor(
    private readonly prisma: PrismaService,
    @Inject(StorageService) private readonly storage: StorageService,
    private readonly mail: MailService,
  ) {}

  async signup(dto: SignupDto): Promise<AuthResponse> {
    const email = dto.email.trim().toLowerCase();

    // Fast-path advisory check for a clean error in the common case. It is NOT the
    // guard against concurrent signups of the same email — two requests can both pass
    // it before either inserts. The DB's User.email @unique is the real backstop: the
    // create() (first statement in the txn) aborts the whole transaction on collision,
    // so there are no orphan workspace/membership rows. We translate that P2002 to a
    // 409 instead of letting it surface as a 500.
    const existing = await this.prisma.user.findUnique({ where: { email }, select: { id: true } });
    if (existing) throw new ConflictException("email already registered");

    let user, workspace;
    try {
      ({ user, workspace } = await this.prisma.$transaction((tx) =>
        this.createUserWithWorkspace(tx, {
          email,
          passwordHash: hash(dto.password),
          fullName: dto.fullName,
          workspaceName: dto.workspaceName,
          timezone: dto.timezone,
        }),
      ));
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
        throw new ConflictException("email already registered");
      }
      throw err;
    }

    // Log ids only — never email/PII (§2).
    this.logger.log(`signup user=${user.id} ws=${workspace.id}`);

    this.dispatchWelcomeEmail(user);

    // Build through the single AuthUserDto builder so avatarUrl/theme stay
    // consistent everywhere a user is returned. New users: avatarKey null,
    // theme "system" (the schema default).
    const authUser = await this.loadAuthUser(user.id);
    return { user: authUser, tokens: this.issueTokens(user.id) };
  }

  async authenticateGoogle(dto: GoogleAuthDto): Promise<LoginResultDto> {
    let identity;
    try {
      identity = await this.resolveGoogleIdentity(dto.code);
    } catch {
      throw new UnauthorizedException("invalid Google authorization code");
    }
    // Only trust a Google-verified email — otherwise someone could claim an address
    // they don't own and take over an existing account by email match.
    if (!identity.emailVerified) {
      throw new UnauthorizedException("Google email is not verified");
    }

    const email = identity.email.trim().toLowerCase();

    // Match on the stable Google subject first, then fall back to email so an existing
    // email/password account is linked (not duplicated) on first Google sign-in.
    const existing =
      (await this.prisma.user.findUnique({ where: { googleId: identity.googleId } })) ??
      (await this.prisma.user.findUnique({ where: { email } }));

    let userId: string;
    if (existing) {
      userId = existing.id;
      if (!existing.googleId) {
        await this.prisma.user.update({
          where: { id: existing.id },
          data: { googleId: identity.googleId },
        });
        this.logger.log(`google-link user=${existing.id}`); // id only (§2)
      } else {
        this.logger.log(`google-login user=${existing.id}`); // id only (§2)
      }
    } else {
      // New user — no workspace name was collected, so derive a friendly default from
      // the Google display name; the recruiter can rename it later in settings.
      const firstName = identity.name.trim().split(/\s+/)[0] || "My";
      const { user, workspace } = await this.prisma.$transaction((tx) =>
        this.createUserWithWorkspace(tx, {
          email,
          passwordHash: null,
          googleId: identity.googleId,
          fullName: identity.name || email,
          workspaceName: `${firstName}'s Workspace`,
          timezone: dto.timezone,
        }),
      );
      userId = user.id;
      this.logger.log(`google-signup user=${user.id} ws=${workspace.id}`); // ids only (§2)
      this.dispatchWelcomeEmail(user);
    }

    // A freshly created Google user has 2FA off; a returning user may have enabled it.
    return this.issueOrChallenge(userId, existing?.twoFactorEnabled ?? false);
  }

  // Creates a new user + their first Workspace + owner Membership + free-tier
  // CreditAccount as one unit. The single source of truth for the "new account"
  // invariant (§4 credit grant, owner membership) — shared by email/password signup
  // and Google sign-up so the two paths can never drift. Runs inside the caller's tx.
  private async createUserWithWorkspace(
    tx: Tx,
    input: {
      email: string;
      passwordHash: string | null;
      fullName: string;
      workspaceName: string;
      googleId?: string;
      /** Browser-detected IANA timezone; seeds the timezone pref + derived country. */
      timezone?: string;
    },
  ) {
    // Auto-detect signup defaults from the browser timezone: seed the timezone
    // preference and derive a best-effort country (ISO 3166-1 alpha-2). Both are
    // sensible defaults the recruiter can correct later in Settings. An absent or
    // unknown zone falls through to the schema default ("UTC") with a null country.
    const timezone = input.timezone?.trim() || undefined;
    const country = countryFromTimezone(timezone);
    const user = await tx.user.create({
      data: {
        email: input.email,
        passwordHash: input.passwordHash,
        fullName: input.fullName,
        googleId: input.googleId,
        timezone,
        country,
      },
    });
    const workspace = await tx.workspace.create({ data: { name: input.workspaceName, plan: "free" } });
    const membership = await tx.membership.create({
      data: { workspaceId: workspace.id, userId: user.id, role: "owner" },
    });
    await tx.creditAccount.create({
      data: {
        workspaceId: workspace.id,
        balance: FREE_TIER_CREDITS,
        // Granted on creation so the lazy daily renewal doesn't immediately
        // re-grant within the same UTC day (CreditsService.ensureDailyGrant).
        dailyAllotment: FREE_TIER_CREDITS,
        lastGrantedAt: new Date(),
      },
    });
    return { user, workspace, membership };
  }

  // Best-effort welcome email, fired after the signup transaction commits.
  // Fire-and-forget on purpose: signup must never block on (or fail because of)
  // an external email send. Inert without RESEND_API_KEY. Logs ids only — never
  // the recipient's email or name (§2/§6).
  private dispatchWelcomeEmail(user: { id: string; email: string; fullName: string }): void {
    const firstName = user.fullName.trim().split(/\s+/)[0] || undefined;
    const appUrl = process.env.APP_URL ?? "";
    // Deferred into the microtask chain so a *synchronous* throw (e.g. a partial
    // test double without the method) also lands in .catch() — never on signup.
    void Promise.resolve()
      .then(() => this.mail.sendWelcomeEmail({ to: user.email, firstName, appUrl }))
      .then((result) => {
        if (result.sent) this.logger.log(`welcome email sent user=${user.id}`); // id only
      })
      .catch(() => {
        // Swallow — a mail hiccup must never fail an account creation.
        this.logger.warn(`welcome email failed user=${user.id}`); // id only, no error body (§2/§6)
      });
  }

  async login(dto: LoginDto): Promise<LoginResultDto> {
    const email = dto.email.trim().toLowerCase();
    const user = await this.prisma.user.findUnique({ where: { email } });
    // Generic error — never reveal whether the email or the password was wrong.
    if (!user || !verify(dto.password, user.passwordHash)) {
      throw new UnauthorizedException("invalid credentials");
    }
    this.logger.log(`login user=${user.id}`);
    return this.issueOrChallenge(user.id, user.twoFactorEnabled);
  }

  // After a verified first factor (password or Google), either issue tokens or —
  // when 2FA is enabled — return a short-lived challenge the client completes with
  // a TOTP code at /auth/login/2fa. The single chokepoint so both login paths gate
  // identically.
  private async issueOrChallenge(userId: string, twoFactorEnabled: boolean): Promise<LoginResultDto> {
    if (twoFactorEnabled) {
      return { twoFactorRequired: true, challengeToken: signTwoFactorChallenge(userId) };
    }
    const authUser = await this.loadAuthUser(userId);
    return { user: authUser, tokens: this.issueTokens(userId) };
  }

  // Step two of a 2FA-gated login: verify the challenge token + TOTP code, then issue
  // tokens. Public (no bearer yet) — the challenge token is the credential.
  async completeTwoFactorLogin(dto: TwoFactorLoginDto): Promise<AuthResponse> {
    let userId: string;
    try {
      userId = verifyTwoFactorChallenge(dto.challengeToken).sub;
    } catch {
      throw new UnauthorizedException("invalid or expired sign-in challenge");
    }
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { twoFactorEnabled: true, totpSecretEncrypted: true },
    });
    if (!user || !user.twoFactorEnabled || !user.totpSecretEncrypted) {
      throw new UnauthorizedException("two-factor is not enabled");
    }
    const secret = decryptField(user.totpSecretEncrypted);
    if (!secret || !(await verifyTotp(dto.code, secret))) {
      throw new UnauthorizedException("invalid authentication code");
    }
    const authUser = await this.loadAuthUser(userId);
    this.logger.log(`2fa login user=${userId}`); // id only (§2)
    return { user: authUser, tokens: this.issueTokens(userId) };
  }

  refresh(refreshToken: string): { tokens: AuthTokens } {
    let userId: string;
    try {
      userId = verifyToken(refreshToken).sub;
    } catch {
      throw new UnauthorizedException("invalid refresh token");
    }
    return { tokens: this.issueTokens(userId) };
  }

  async me(userId: string): Promise<AuthUserDto> {
    return this.loadAuthUser(userId);
  }

  // ── Profile (user-scoped: AuthGuard only, no workspace/tenant context) ──────
  async updateProfile(userId: string, dto: UpdateProfileDto): Promise<AuthUserDto> {
    // NOTE: `email` is intentionally NOT updatable here — it's the immutable sign-in
    // identity. It isn't on UpdateProfileDto and ValidationPipe({ whitelist: true })
    // strips any `email` a client sends, so it can never reach this update.
    const data: {
      fullName?: string;
      theme?: ThemePreference;
      timezone?: string;
      country?: string | null;
      currency?: string;
      tourProgress?: TourProgress;
    } = {};
    if (dto.fullName !== undefined) data.fullName = dto.fullName;
    if (dto.theme !== undefined) data.theme = dto.theme;
    if (dto.timezone !== undefined) data.timezone = dto.timezone;
    // An empty string clears the country; otherwise normalize to upper-case alpha-2.
    if (dto.country !== undefined) data.country = dto.country?.trim() ? dto.country.trim().toUpperCase() : null;
    if (dto.currency !== undefined) data.currency = dto.currency;

    // Tour progress is MERGED, never replaced: marking one screen seen must not
    // wipe the others. Sanitize incoming keys/values against the known screen
    // list so only clean booleans land in the JSON column.
    if (dto.tourProgress !== undefined) {
      const current = await this.prisma.user.findUnique({
        where: { id: userId },
        select: { tourProgress: true },
      });
      if (!current) throw new NotFoundException("user not found");
      data.tourProgress = mergeTourProgress(current.tourProgress, dto.tourProgress);
    }

    // Scoped by the authenticated user's own id — a user only edits themselves.
    await this.prisma.user.update({ where: { id: userId }, data });
    this.logger.log(`profile update user=${userId}`); // id only (§2)
    return this.loadAuthUser(userId);
  }

  // Marks the first-run onboarding as seen. Idempotent: only stamps the first
  // time (so a re-trigger never resets it), scoped to the authenticated user's
  // own id. Returns the refreshed principal so the client updates in place.
  async completeOnboarding(userId: string): Promise<AuthUserDto> {
    await this.prisma.user.updateMany({
      where: { id: userId, onboardedAt: null },
      data: { onboardedAt: new Date() },
    });
    this.logger.log(`onboarding completed user=${userId}`); // id only (§2)
    return this.loadAuthUser(userId);
  }

  async changePassword(userId: string, dto: ChangePasswordDto): Promise<void> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { passwordHash: true },
    });
    if (!user) throw new NotFoundException("user not found");

    if (!verify(dto.currentPassword, user.passwordHash)) {
      throw new BadRequestException("current password is incorrect");
    }

    await this.prisma.user.update({
      where: { id: userId },
      data: { passwordHash: hash(dto.newPassword) },
    });
    this.logger.log(`password change user=${userId}`); // id only (§2)
  }

  // ── Two-factor auth (TOTP) ──────────────────────────────────────────────────
  // Begin enrollment: mint a secret, store it ENCRYPTED but pending (2FA stays off
  // until a code is verified), and return the QR + secret for the authenticator app.
  async setupTwoFactor(userId: string): Promise<TwoFactorSetupDto> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { email: true, twoFactorEnabled: true },
    });
    if (!user) throw new NotFoundException("user not found");
    if (user.twoFactorEnabled) throw new BadRequestException("two-factor is already enabled");

    const secret = generateTotpSecret();
    await this.prisma.user.update({
      where: { id: userId },
      data: { totpSecretEncrypted: encryptField(secret) }, // encrypted at rest (§2/§6)
    });
    const otpauthUri = totpKeyUri(user.email, secret);
    const qrDataUrl = await totpQrDataUrl(otpauthUri);
    this.logger.log(`2fa setup user=${userId}`); // id only; never log the secret (§6)
    return { otpauthUri, qrDataUrl, secret };
  }

  // Confirm enrollment: verify a code against the pending secret, then flip 2FA on.
  async enableTwoFactor(userId: string, dto: TwoFactorVerifyDto): Promise<AuthUserDto> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { totpSecretEncrypted: true, twoFactorEnabled: true },
    });
    if (!user) throw new NotFoundException("user not found");
    if (user.twoFactorEnabled) throw new BadRequestException("two-factor is already enabled");
    const secret = user.totpSecretEncrypted ? decryptField(user.totpSecretEncrypted) : null;
    if (!secret) throw new BadRequestException("start two-factor setup first");
    if (!(await verifyTotp(dto.code, secret))) {
      throw new BadRequestException("invalid authentication code");
    }

    await this.prisma.user.update({ where: { id: userId }, data: { twoFactorEnabled: true } });
    this.logger.log(`2fa enabled user=${userId}`); // id only (§2)
    return this.loadAuthUser(userId);
  }

  // Turn 2FA off: require a current code, then clear the secret + flag.
  async disableTwoFactor(userId: string, dto: TwoFactorVerifyDto): Promise<AuthUserDto> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { totpSecretEncrypted: true, twoFactorEnabled: true },
    });
    if (!user) throw new NotFoundException("user not found");
    if (!user.twoFactorEnabled || !user.totpSecretEncrypted) {
      throw new BadRequestException("two-factor is not enabled");
    }
    const secret = decryptField(user.totpSecretEncrypted);
    if (!secret || !(await verifyTotp(dto.code, secret))) {
      throw new BadRequestException("invalid authentication code");
    }
    await this.prisma.user.update({
      where: { id: userId },
      data: { twoFactorEnabled: false, totpSecretEncrypted: null },
    });
    this.logger.log(`2fa disabled user=${userId}`); // id only (§2)
    return this.loadAuthUser(userId);
  }

  // ── Delete account (hard delete — DB rows AND files, §2) ────────────────────
  async deleteAccount(userId: string, dto: DeleteAccountDto): Promise<void> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, email: true, passwordHash: true, avatarKey: true },
    });
    if (!user) throw new NotFoundException("user not found");

    // Confirm identity: the typed email must match; a password account must also
    // re-enter its password (Google-only accounts confirm by email alone).
    if (dto.confirmEmail.trim().toLowerCase() !== user.email.toLowerCase()) {
      throw new BadRequestException("the confirmation email does not match your account");
    }
    if (user.passwordHash && (!dto.password || !verify(dto.password, user.passwordHash))) {
      throw new BadRequestException("password is incorrect");
    }

    // Decide each workspace's fate: sole member → delete the whole workspace; shared
    // and not the last owner → just drop my membership; last owner of a shared
    // workspace → block (the recruiter must transfer ownership first).
    const memberships = await this.prisma.membership.findMany({
      where: { userId },
      select: { workspaceId: true, role: true },
    });
    const workspacesToDelete: string[] = [];
    const membershipsToRemove: string[] = [];
    let blocked = false;
    for (const m of memberships) {
      const members = await this.prisma.membership.findMany({
        where: { workspaceId: m.workspaceId },
        select: { userId: true, role: true },
      });
      const others = members.filter((x) => x.userId !== userId);
      if (others.length === 0) {
        workspacesToDelete.push(m.workspaceId);
      } else if (m.role === "owner" && !others.some((x) => x.role === "owner")) {
        blocked = true;
      } else {
        membershipsToRemove.push(m.workspaceId);
      }
    }
    if (blocked) {
      throw new ConflictException(
        "You're the last owner of a shared workspace. Transfer ownership or remove the other members before deleting your account.",
      );
    }

    // Pre-collect storage keys for full-delete workspaces (the DB rows vanish on
    // cascade, so gather keys first). Also clean this user's avatar in surviving
    // shared workspaces.
    const fileDeletes: { workspaceId: string; keys: string[] }[] = [];
    for (const wsId of workspacesToDelete) {
      fileDeletes.push({ workspaceId: wsId, keys: await this.collectWorkspaceStorageKeys(wsId) });
    }
    if (user.avatarKey) {
      for (const wsId of membershipsToRemove) {
        if (user.avatarKey.startsWith(workspaceKey(wsId) + "/")) {
          fileDeletes.push({ workspaceId: wsId, keys: [user.avatarKey] });
        }
      }
    }

    // DB delete in one transaction: a workspace delete cascades every tenant table;
    // the user delete cascades any remaining memberships.
    await this.prisma.$transaction(async (tx) => {
      if (workspacesToDelete.length > 0) {
        await tx.workspace.deleteMany({ where: { id: { in: workspacesToDelete } } });
      }
      if (membershipsToRemove.length > 0) {
        await tx.membership.deleteMany({
          where: { userId, workspaceId: { in: membershipsToRemove } },
        });
      }
      await tx.user.delete({ where: { id: userId } });
    });

    // Files: best-effort AFTER the DB commit (mirrors candidate delete) — a storage
    // hiccup must never resurrect a deleted account.
    for (const { workspaceId, keys } of fileDeletes) {
      if (keys.length === 0) continue;
      try {
        await this.storage.deleteMany(workspaceId, keys);
      } catch {
        this.logger.warn(`account delete: file cleanup partial ws=${workspaceId} keys=${keys.length}`);
      }
    }
    this.logger.log(
      `account deleted user=${userId} ws_deleted=${workspacesToDelete.length} ws_left=${membershipsToRemove.length}`,
    ); // ids/counts only (§2)
  }

  // Every storage key under a workspace (resume uploads, candidate photos, member
  // avatars), filtered to this workspace's prefix so deleteMany's boundary guard
  // never trips. Used when a workspace is fully deleted.
  private async collectWorkspaceStorageKeys(workspaceId: string): Promise<string[]> {
    const [uploads, candidates, members] = await Promise.all([
      this.prisma.uploadedFile.findMany({ where: { workspaceId }, select: { storageKey: true } }),
      this.prisma.candidate.findMany({ where: { workspaceId }, select: { photoKey: true } }),
      this.prisma.membership.findMany({
        where: { workspaceId },
        select: { user: { select: { avatarKey: true } } },
      }),
    ]);
    const prefix = workspaceKey(workspaceId) + "/";
    const keys = [
      ...uploads.map((u) => u.storageKey),
      ...candidates.map((c) => c.photoKey),
      ...members.map((m) => m.user.avatarKey),
    ].filter((k): k is string => k != null && k.startsWith(prefix));
    return [...new Set(keys)];
  }

  // ── Forgot / reset password (PUBLIC) ───────────────────────────────────────
  async forgotPassword(dto: ForgotPasswordDto): Promise<void> {
    const email = dto.email.trim().toLowerCase();
    const user = await this.prisma.user.findUnique({ where: { email }, select: { id: true } });

    // ALWAYS return success — never reveal whether the email exists (no enumeration).
    if (!user) return;

    // Random token; only its SHA-256 hash is persisted (§6). The raw token lives
    // only in the email link.
    const rawToken = randomBytes(32).toString("hex");
    const tokenHash = createHash("sha256").update(rawToken).digest("hex");

    await this.prisma.user.update({
      where: { id: user.id },
      data: {
        passwordResetTokenHash: tokenHash,
        passwordResetExpiresAt: new Date(Date.now() + RESET_TTL_MS),
      },
    });

    const resetUrl = `${process.env.APP_URL ?? ""}/reset-password?token=${rawToken}`;
    const result = await this.mail.sendPasswordResetEmail({ to: email, resetUrl });

    if (!result.sent) {
      // Dev only: no Resend key configured, so surface the link locally. Never
      // reached in prod (RESEND_API_KEY set) — and we only log it when NOT sent (§6).
      this.logger.log(`[dev] password reset link: ${resetUrl}`);
    } else {
      this.logger.log(`password reset email sent user=${user.id}`); // id only, no token/email (§2/§6)
    }
  }

  async resetPassword(dto: ResetPasswordDto): Promise<void> {
    const tokenHash = createHash("sha256").update(dto.token).digest("hex");
    // Atomically CLAIM the token: set the new password and clear the token in one
    // conditional write. Two requests racing the same link (legit user vs. a leaked
    // one) can't both succeed — the first clears the token, so the second matches zero
    // rows. A find-then-update would let both pass the check and the last writer win.
    const claimed = await this.prisma.user.updateMany({
      where: {
        passwordResetTokenHash: tokenHash,
        passwordResetExpiresAt: { gt: new Date() },
      },
      data: {
        passwordHash: hash(dto.newPassword),
        passwordResetTokenHash: null,
        passwordResetExpiresAt: null,
      },
    });
    if (claimed.count === 0) throw new BadRequestException("invalid or expired reset link");
    this.logger.log(`password reset completed count=${claimed.count}`); // no ids/token (§2/§6)
  }

  // ── Passwordless (magic-link) login (PUBLIC) ───────────────────────────────
  async requestMagicLink(dto: RequestMagicLinkDto): Promise<void> {
    const email = dto.email.trim().toLowerCase();
    const user = await this.prisma.user.findUnique({
      where: { email },
      select: { id: true, fullName: true },
    });

    // ALWAYS return success — never reveal whether the email exists (no enumeration).
    if (!user) return;

    // Random token; only its SHA-256 hash is persisted (§6). The raw token lives
    // only in the email link. Mirrors the reset flow, with a shorter TTL.
    const rawToken = randomBytes(32).toString("hex");
    const tokenHash = createHash("sha256").update(rawToken).digest("hex");

    await this.prisma.user.update({
      where: { id: user.id },
      data: {
        loginTokenHash: tokenHash,
        loginTokenExpiresAt: new Date(Date.now() + MAGIC_LINK_TTL_MS),
      },
    });

    const firstName = user.fullName.trim().split(/\s+/)[0] || undefined;
    const magicUrl = `${process.env.APP_URL ?? ""}/magic-link?token=${rawToken}`;
    const result = await this.mail.sendMagicLinkEmail({ to: email, firstName, magicUrl });

    if (!result.sent) {
      // Dev only: no Resend key configured, so surface the link locally. Never
      // reached in prod (RESEND_API_KEY set) — and we only log it when NOT sent (§6).
      this.logger.log(`[dev] magic login link: ${magicUrl}`);
    } else {
      this.logger.log(`magic link email sent user=${user.id}`); // id only, no token/email (§2/§6)
    }
  }

  async verifyMagicLink(dto: VerifyMagicLinkDto): Promise<LoginResultDto> {
    const tokenHash = createHash("sha256").update(dto.token).digest("hex");

    // Look up the unredeemed, unexpired link to recover the principal + their 2FA
    // state (updateMany can't return the row).
    const user = await this.prisma.user.findFirst({
      where: { loginTokenHash: tokenHash, loginTokenExpiresAt: { gt: new Date() } },
      select: { id: true, twoFactorEnabled: true },
    });
    if (!user) throw new BadRequestException("invalid or expired login link");

    // Atomically CLAIM the token — clear it conditioned on it still matching, so a
    // replayed or raced link can't redeem twice: the first claim nulls the hash, so a
    // second concurrent request matches zero rows.
    const claimed = await this.prisma.user.updateMany({
      where: { id: user.id, loginTokenHash: tokenHash },
      data: { loginTokenHash: null, loginTokenExpiresAt: null },
    });
    if (claimed.count === 0) throw new BadRequestException("invalid or expired login link");

    this.logger.log(`magic-link login user=${user.id}`); // id only (§2/§6)
    // Honour 2FA — a magic link proves email possession; an enrolled account still
    // completes the TOTP step, identical to password/Google login.
    return this.issueOrChallenge(user.id, user.twoFactorEnabled);
  }

  // ── Avatar (user-scoped; workspaceId resolved from membership, never a body) ─
  async setAvatar(userId: string, avatar: IncomingAvatar): Promise<AuthUserDto> {
    const ext = AVATAR_EXTENSIONS[avatar.mimetype];
    if (!ext) {
      throw new BadRequestException("avatar must be a PNG, JPEG, or WEBP image");
    }

    // Phase 1: a user owns exactly one workspace — resolve it from membership;
    // the storage key is namespaced under that workspace (§1).
    const membership = await this.prisma.membership.findFirst({
      where: { userId },
      orderBy: { id: "asc" },
      select: { workspaceId: true },
    });
    if (!membership) throw new NotFoundException("user has no workspace");

    const key = workspaceKey(membership.workspaceId, "avatars", `${userId}.${ext}`);
    await this.storage.put(membership.workspaceId, key, avatar.buffer, avatar.mimetype);

    await this.prisma.user.update({ where: { id: userId }, data: { avatarKey: key } });
    this.logger.log(`avatar set user=${userId} ws=${membership.workspaceId}`); // ids only (§2)
    return this.loadAuthUser(userId);
  }

  // Loads the user's first workspace context (Phase 1: a user owns one workspace).
  private async loadAuthUser(userId: string): Promise<AuthUserDto> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: {
        memberships: {
          orderBy: { id: "asc" },
          take: 1,
          include: { workspace: true },
        },
      },
    });
    if (!user) throw new NotFoundException("user not found");
    const membership = user.memberships[0];
    if (!membership) throw new NotFoundException("user has no workspace");

    // Avatar URL is a short-lived signed GET scoped to the user's workspace
    // (§1/§2) — null when no photo is set. Theme falls back to "system".
    const avatarUrl = user.avatarKey
      ? await this.storage.signedGetUrl(membership.workspaceId, user.avatarKey, AVATAR_URL_TTL)
      : null;

    return {
      id: user.id,
      email: user.email,
      fullName: user.fullName,
      workspaceId: membership.workspaceId,
      workspaceName: membership.workspace.name,
      role: membership.role as WorkspaceRole,
      avatarUrl,
      theme: (user.theme as ThemePreference) ?? "system",
      timezone: user.timezone ?? "UTC",
      country: user.country ?? null,
      currency: user.currency ?? "USD",
      twoFactorEnabled: user.twoFactorEnabled ?? false,
      tourProgress: sanitizeTourProgress(user.tourProgress),
      onboardedAt: user.onboardedAt ? user.onboardedAt.toISOString() : null,
    };
  }

  private issueTokens(userId: string): AuthTokens {
    return {
      accessToken: signAccess({ sub: userId }),
      refreshToken: signRefresh({ sub: userId }),
    };
  }
}
