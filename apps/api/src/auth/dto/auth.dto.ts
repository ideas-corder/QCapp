import { Transform } from 'class-transformer';
import { IsEmail, IsIn, IsOptional, IsString, MinLength } from 'class-validator';
import { UiLayout, UserRole } from '../../database/entities/user.entity';

export class RegisterDto {
  // Trim + lowercase before validation so a paste-with-spaces or a
  // mistyped capital "A" doesn't get rejected as a malformed email
  // by `@IsEmail()` and doesn't create two accounts that differ
  // only in case. The same rule applies at sign-in (see LoginDto).
  @Transform(({ value }) =>
    typeof value === 'string' ? value.trim().toLowerCase() : value,
  )
  @IsEmail()
  email!: string;

  @IsString()
  @MinLength(8)
  password!: string;

  @IsString()
  @MinLength(2)
  fullName!: string;

  @IsOptional()
  @IsIn(['admin', 'inspector', 'viewer'])
  role?: UserRole;
}

export class LoginDto {
  @Transform(({ value }) =>
    typeof value === 'string' ? value.trim().toLowerCase() : value,
  )
  @IsEmail()
  email!: string;

  @IsString()
  password!: string;
}

export class VerifyMfaDto {
  @IsString()
  mfaPendingToken!: string;

  @IsString()
  @MinLength(6)
  totpCode!: string;
}

export class RefreshDto {
  @IsString()
  refreshToken!: string;
}

export class ConfirmMfaDto {
  @IsString()
  @MinLength(6)
  totpCode!: string;
}

/**
 * Update user preferences. Currently supports the New Inspection form
 * layout. Unknown fields are ignored on purpose so the endpoint can grow
 * without breaking older clients.
 */
export class UpdatePreferencesDto {
  @IsOptional()
  @IsIn(['modern', 'classic'])
  uiLayout?: UiLayout;
}
