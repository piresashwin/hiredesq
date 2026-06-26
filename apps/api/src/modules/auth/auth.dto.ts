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
  ResetPasswordInput,
  ThemePreference,
  TourProgress,
  TwoFactorLoginInput,
  TwoFactorVerifyInput,
  UpdateProfileInput,
} from "@hiredesq/shared";

// No workspaceId in any auth body — signup creates one; later requests carry it
// in the route param (CLAUDE.md §1).

// The allowed theme values, kept in sync with ThemePreference (validated below).
const THEMES: ThemePreference[] = ["light", "dark", "system"];

export class SignupDto {
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
