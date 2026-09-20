import {
  IsBoolean,
  IsEmail,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';

/**
 * Codes are short identifiers admins can read aloud or scan
 * (e.g. INSP-001, A-123). Service uppercases on the way in.
 */
export const INSPECTOR_CODE_REGEX = /^[A-Z0-9_-]{1,32}$/;

export class CreateInspectorDto {
  @IsString()
  @MinLength(1)
  @MaxLength(32)
  @Matches(INSPECTOR_CODE_REGEX, {
    message:
      'code must be 1–32 chars, uppercase letters / digits / dash / underscore (e.g. INSP-001, A-123)',
  })
  code!: string;

  @IsString()
  @MinLength(2)
  @MaxLength(255)
  name!: string;

  @IsOptional()
  @IsEmail()
  @MaxLength(255)
  email?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  phone?: string | null;

  @IsOptional()
  @IsString()
  notes?: string | null;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class UpdateInspectorDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(32)
  @Matches(INSPECTOR_CODE_REGEX, {
    message:
      'code must be 1–32 chars, uppercase letters / digits / dash / underscore',
  })
  code?: string;

  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(255)
  name?: string;

  @IsOptional()
  @IsEmail()
  @MaxLength(255)
  email?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  phone?: string | null;

  @IsOptional()
  @IsString()
  notes?: string | null;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
