import {
  IsBoolean,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';

/**
 * Codes are short UPPER_SNAKE strings (e.g. INLINE, FINAL, DUPRO,
 * PRE-SHIPMENT). We accept what the user typed and uppercase it in the
 * service so admin input is forgiving.
 */
export const INSPECTION_TYPE_CODE_REGEX = /^[A-Z0-9_-]{1,32}$/;

export class CreateInspectionTypeDto {
  @IsString()
  @MinLength(1)
  @MaxLength(32)
  @Matches(INSPECTION_TYPE_CODE_REGEX, {
    message:
      'code must be 1–32 chars, uppercase letters / digits / dash / underscore (e.g. INLINE, PRE-SHIPMENT)',
  })
  code!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(255)
  label!: string;

  @IsOptional()
  @IsString()
  description?: string | null;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class UpdateInspectionTypeDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(32)
  @Matches(INSPECTION_TYPE_CODE_REGEX, {
    message:
      'code must be 1–32 chars, uppercase letters / digits / dash / underscore',
  })
  code?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(255)
  label?: string;

  @IsOptional()
  @IsString()
  description?: string | null;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}