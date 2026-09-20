import {
  IsBoolean,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';

/**
 * Codes are short UPPER_SNAKE strings (e.g. APPAREL, FOOTWEAR,
 * ELECTRONICS). Service uppercases on the way in so admin input is
 * forgiving.
 */
export const PRODUCT_CATEGORY_CODE_REGEX = /^[A-Z0-9_-]{1,64}$/;

export class CreateProductCategoryDto {
  @IsString()
  @MinLength(1)
  @MaxLength(64)
  @Matches(PRODUCT_CATEGORY_CODE_REGEX, {
    message:
      'code must be 1–64 chars, uppercase letters / digits / dash / underscore (e.g. APPAREL, KIDS-WEAR)',
  })
  code!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(255)
  name!: string;

  @IsOptional()
  @IsString()
  description?: string | null;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class UpdateProductCategoryDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(64)
  @Matches(PRODUCT_CATEGORY_CODE_REGEX, {
    message:
      'code must be 1–64 chars, uppercase letters / digits / dash / underscore',
  })
  code?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(255)
  name?: string;

  @IsOptional()
  @IsString()
  description?: string | null;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
