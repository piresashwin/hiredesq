import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  Patch,
  Post,
  Req,
  UseGuards,
} from "@nestjs/common";
import type {
  AuthResponse,
  AuthTokens,
  AuthUserDto,
  LoginResultDto,
  TwoFactorSetupDto,
} from "@hiredesq/shared";
import { AuthGuard, type AuthedRequest } from "../../common/guards.js";
import { AuthService } from "./auth.service.js";
import {
  SignupDto,
  LoginDto,
  GoogleAuthDto,
  RefreshDto,
  UpdateProfileDto,
  ChangePasswordDto,
  DeleteAccountDto,
  ForgotPasswordDto,
  ResetPasswordDto,
  TwoFactorLoginDto,
  TwoFactorVerifyDto,
} from "./auth.dto.js";

// One multipart part as exposed by @fastify/multipart. Structural type so we don't
// depend on a `fastify` import — same approach as UploadsController. We touch only
// fieldname/mimetype/toBuffer.
interface MultipartPart {
  fieldname: string;
  mimetype: string;
  toBuffer(): Promise<Buffer>;
}

// The Fastify request augmented by @fastify/multipart, plus the principal the
// AuthGuard sets.
interface MultipartAuthedRequest extends AuthedRequest {
  isMultipart(): boolean;
  files(): AsyncIterableIterator<MultipartPart>;
}

// Avatars are capped well below the global 25MB multipart limit (sized for resume
// drops) — a profile photo doesn't need more (§2 — bound what we store).
const AVATAR_MAX_BYTES = 2 * 1024 * 1024;

// Session-establishing routes — NOT under /workspaces (no workspace context yet).
// signup/login/refresh + forgot/reset are PUBLIC; me/profile/change-password/avatar
// are USER-scoped (AuthGuard only — they act on req.user.id, not a workspace, so no
// TenantGuard).
@Controller("auth")
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Post("signup")
  signup(@Body() dto: SignupDto): Promise<AuthResponse> {
    return this.auth.signup(dto);
  }

  // Returns tokens, OR — when the account has 2FA enabled — a short-lived challenge
  // the client completes at /auth/login/2fa with a TOTP code.
  @Post("login")
  login(@Body() dto: LoginDto): Promise<LoginResultDto> {
    return this.auth.login(dto);
  }

  // PUBLIC — completes a 2FA-gated login: challenge token (from /auth/login) + code.
  @Post("login/2fa")
  loginTwoFactor(@Body() dto: TwoFactorLoginDto): Promise<AuthResponse> {
    return this.auth.completeTwoFactorLogin(dto);
  }

  // PUBLIC — Google Identity Services sign in / sign up. Find-or-creates the user from
  // a verified ID token; returns tokens or a 2FA challenge, same as password login.
  @Post("google")
  google(@Body() dto: GoogleAuthDto): Promise<LoginResultDto> {
    return this.auth.authenticateGoogle(dto);
  }

  @Post("refresh")
  refresh(@Body() dto: RefreshDto): { tokens: AuthTokens } {
    return this.auth.refresh(dto.refreshToken);
  }

  @Get("me")
  @UseGuards(AuthGuard)
  me(@Req() req: AuthedRequest): Promise<AuthUserDto> {
    return this.auth.me(req.user!.id);
  }

  @Patch("profile")
  @UseGuards(AuthGuard)
  updateProfile(@Req() req: AuthedRequest, @Body() dto: UpdateProfileDto): Promise<AuthUserDto> {
    return this.auth.updateProfile(req.user!.id, dto);
  }

  // Marks the first-run onboarding takeover as seen (idempotent, user-scoped).
  // No body — the action is the whole intent. Returns the refreshed principal.
  @Post("onboarding/complete")
  @UseGuards(AuthGuard)
  completeOnboarding(@Req() req: AuthedRequest): Promise<AuthUserDto> {
    return this.auth.completeOnboarding(req.user!.id);
  }

  @Post("change-password")
  @UseGuards(AuthGuard)
  @HttpCode(204)
  changePassword(@Req() req: AuthedRequest, @Body() dto: ChangePasswordDto): Promise<void> {
    return this.auth.changePassword(req.user!.id, dto);
  }

  // ── Two-factor auth (user-scoped) ──────────────────────────────────────────
  // Begin enrollment — returns the QR + secret. 2FA is not active until /enable.
  @Post("2fa/setup")
  @UseGuards(AuthGuard)
  setupTwoFactor(@Req() req: AuthedRequest): Promise<TwoFactorSetupDto> {
    return this.auth.setupTwoFactor(req.user!.id);
  }

  // Verify a code against the pending secret and turn 2FA on.
  @Post("2fa/enable")
  @UseGuards(AuthGuard)
  enableTwoFactor(@Req() req: AuthedRequest, @Body() dto: TwoFactorVerifyDto): Promise<AuthUserDto> {
    return this.auth.enableTwoFactor(req.user!.id, dto);
  }

  // Verify a current code and turn 2FA off (clears the secret).
  @Post("2fa/disable")
  @UseGuards(AuthGuard)
  disableTwoFactor(@Req() req: AuthedRequest, @Body() dto: TwoFactorVerifyDto): Promise<AuthUserDto> {
    return this.auth.disableTwoFactor(req.user!.id, dto);
  }

  // Permanently delete the signed-in account (DB rows + stored files, §2). 204 on
  // success; 409 when the user is the last owner of a shared workspace.
  @Post("delete-account")
  @UseGuards(AuthGuard)
  @HttpCode(204)
  deleteAccount(@Req() req: AuthedRequest, @Body() dto: DeleteAccountDto): Promise<void> {
    return this.auth.deleteAccount(req.user!.id, dto);
  }

  // PUBLIC — always 204, never reveals whether the email exists (no enumeration).
  @Post("forgot-password")
  @HttpCode(204)
  forgotPassword(@Body() dto: ForgotPasswordDto): Promise<void> {
    return this.auth.forgotPassword(dto);
  }

  // PUBLIC — completes the reset with the emailed token.
  @Post("reset-password")
  @HttpCode(204)
  resetPassword(@Body() dto: ResetPasswordDto): Promise<void> {
    return this.auth.resetPassword(dto);
  }

  // Multipart avatar upload (field "file"). Reuses the @fastify/multipart pattern
  // from UploadsController; the workspace-namespaced storage key is resolved in the
  // service from the user's membership, never a body (§1).
  @Post("avatar")
  @UseGuards(AuthGuard)
  async uploadAvatar(@Req() req: MultipartAuthedRequest): Promise<AuthUserDto> {
    if (!req.isMultipart()) {
      throw new BadRequestException("expected multipart/form-data");
    }

    // Take the "file" part. We hold bytes only long enough to store them (§2).
    for await (const part of req.files()) {
      if (part.fieldname !== "file") continue;
      const buffer = await part.toBuffer();
      if (buffer.length > AVATAR_MAX_BYTES) {
        throw new BadRequestException("avatar must be 2MB or smaller");
      }
      return this.auth.setAvatar(req.user!.id, { mimetype: part.mimetype, buffer });
    }

    throw new BadRequestException("no avatar file in upload");
  }
}
