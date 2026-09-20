import {
  IsBoolean,
  IsEmail,
  IsIn,
  IsOptional,
  IsString,
  MinLength,
  MaxLength,
} from 'class-validator';
import { UserRole } from '../../database/entities/user.entity';

/**
 * Allowed roles for Users master. Mirrors `UserRole` in the entity so
 * class-validator can `IsIn([...])` the string and we get a clean 400
 * instead of a runtime error.
 */
export const USER_ROLE_VALUES: UserRole[] = ['admin', 'inspector', 'viewer'];

/**
 * Allowed UI layouts. Mirrors `UiLayout` in the entity.
 */
export const USER_UI_LAYOUT_VALUES = ['modern', 'classic'] as const;

/**
 * Body of `POST /users`. The service hashes the password with bcrypt
 * (cost 12) before persisting — the wire shape never sees the hash.
 */
export class CreateUserDto {
  @IsEmail()
  @MaxLength(255)
  email!: string;

  /**
   * Plain-text password supplied by the admin. Minimum length 8 so we
   * don't accept trivially guessable values; bcrypt cost 12 is applied
   * server-side.
   */
  @IsString()
  @MinLength(8)
  @MaxLength(255)
  password!: string;

  @IsString()
  @MinLength(2)
  @MaxLength(255)
  fullName!: string;

  @IsOptional()
  @IsIn(USER_ROLE_VALUES)
  role?: UserRole;

  /**
   * Only honoured when set to true AND the caller is a super-admin.
   * Otherwise the service forces `isSuperAdmin: false` on the new
   * row — super-admin status is bootstrap-only and must not be
   * granted through the regular CRUD endpoints.
   */
  @IsOptional()
  @IsBoolean()
  isSuperAdmin?: boolean;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

/**
 * Body of `PUT /users/:id`. Every field is optional so admins can
 * patch one thing at a time. The service guards against the
 * self-edit and self-disable cases on the super-admin row.
 *
 * `password` is intentionally NOT settable here — admins use the
 * dedicated `POST /users/:id/reset-password` endpoint so the audit
 * trail stays one-action-per-row.
 */
export class UpdateUserDto {
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(255)
  fullName?: string;

  @IsOptional()
  @IsEmail()
  @MaxLength(255)
  email?: string;

  @IsOptional()
  @IsIn(USER_ROLE_VALUES)
  role?: UserRole;

  /**
   * Toggling the active flag. Setting `isActive: false` is the
   * supported soft-delete path; the row stays in the DB so past
   * inspections still resolve to a valid user.
   */
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  /**
   * Only honoured when the caller is a super-admin AND the target
   * row is NOT the caller's own row AND the target row is not the
   * seeded super-admin. Otherwise the service silently drops the
   * field.
   */
  @IsOptional()
  @IsBoolean()
  isSuperAdmin?: boolean;

  @IsOptional()
  @IsIn([...USER_UI_LAYOUT_VALUES])
  uiLayout?: 'modern' | 'classic';
}

export class ResetPasswordDto {
  @IsString()
  @MinLength(8)
  @MaxLength(255)
  newPassword!: string;
}
