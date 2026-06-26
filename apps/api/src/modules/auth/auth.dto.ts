import {
  IsEmail,
  IsIn,
  IsNotEmpty,
  IsObject,
  IsOptional,
  IsString,
  MinLength,
  MaxLength,
} from "class-validator";
import type {
  ChangePasswordInput,
  DeleteAccountInput,
  ForgotPasswordInput,
  GoogleAuthInput,
  RequestMagicLinkInput,
  ResetPasswordInput,
  SignupInput,
  ThemePreference,
  TourProgress,
  TwoFactorLoginInput,
  TwoFactorVerifyInput,
  UpdateProfileInput,
  VerifyMagicLinkInput,
} from "@hiredesq/shared";

// No workspaceId in any auth body — signup creates one; later requests carry it
// in the route param (CLAUDE.md §1).

// The allowed theme values, kept in sync with ThemePreference (validated below).
const THEMES: ThemePreference[] = ["light", "dark", "system"];

export class SignupDto implements SignupInput {
  @IsEmail()
  email!: string;

  @IsString()
  @MinLength(8)
  @MaxLength(200)
  password!: string;

  @IsString()
  @MaxLength(200)
  fullName!: string;

  @IsString()
  @MaxLength(200)
  workspaceName!: string;

  // Browser-detected IANA timezone (e.g. "Asia/Dubai"). Optional; bounded length.
  // Used to seed the timezone preference and derive a default country at signup.
  @IsOptional()
  @IsString()
  @MaxLength(64)
  timezone?: string;
}

export class LoginDto {
  @IsEmail()
  email!: string;

  @IsString()
  password!: string;
}

export class RefreshDto {
  @IsString()
  refreshToken!: string;
}

export class GoogleAuthDto implements GoogleAuthInput {
  @IsString()
  @IsNotEmpty()
  code!: string;

  // Browser-detected IANA timezone (e.g. "Asia/Dubai"). Optional; only used when
  // this Google sign-in CREATES a new account (seeds timezone + default country).
  @IsOptional()
  @IsString()
  @MaxLength(64)
  timezone?: string;
}

// DTOs `implement` the shared *Input contracts so a renamed/retyped field fails
// to compile here AND on the web client (shared-contract parity).

export class UpdateProfileDto implements UpdateProfileInput {
  @IsOptional()
  @IsString()
  @MaxLength(200)
  fullName?: string;

  @IsOptional()
  @IsIn(THEMES)
  theme?: ThemePreference;

  // IANA timezone string (e.g. "Asia/Dubai"). Bounded length; the web sends values
  // from Intl.supportedValuesOf("timeZone").
  @IsOptional()
  @IsString()
  @MaxLength(64)
  timezone?: string;

  // ISO 3166-1 alpha-2 country code (e.g. "AE"). Nullable — an empty string clears it.
  @IsOptional()
  @IsString()
  @MaxLength(2)
  country?: string | null;

  // ISO 4217 currency code (e.g. "USD"). Three letters.
  @IsOptional()
  @IsString()
  @MaxLength(8)
  currency?: string;

  // A map of TourScreen -> boolean. Keys/values are sanitized server-side against
  // the known screen list before persisting, so this only needs to be a plain
  // object of booleans here.
  @IsOptional()
  @IsObject()
  tourProgress?: TourProgress;
}

export class ChangePasswordDto implements ChangePasswordInput {
  @IsString()
  currentPassword!: string;

  @IsString()
  @MinLength(8)
  @MaxLength(200)
  newPassword!: string;
}

export class TwoFactorVerifyDto implements TwoFactorVerifyInput {
  @IsString()
  @IsNotEmpty()
  @MaxLength(10)
  code!: string;
}

export class TwoFactorLoginDto implements TwoFactorLoginInput {
  @IsString()
  @IsNotEmpty()
  challengeToken!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(10)
  code!: string;
}

export class DeleteAccountDto implements DeleteAccountInput {
  @IsEmail()
  confirmEmail!: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  password?: string;
}

export class ForgotPasswordDto implements ForgotPasswordInput {
  @IsEmail()
  email!: string;
}

export class ResetPasswordDto implements ResetPasswordInput {
  @IsString()
  token!: string;

  @IsString()
  @MinLength(8)
  @MaxLength(200)
  newPassword!: string;
}

export class RequestMagicLinkDto implements RequestMagicLinkInput {
  @IsEmail()
  email!: string;
}

export class VerifyMagicLinkDto implements VerifyMagicLinkInput {
  @IsString()
  @IsNotEmpty()
  token!: string;
}
