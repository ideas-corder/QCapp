import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { MaxDecimalPlaces } from '../../common/validators/max-decimal-places.validator';

export class CategoryAqlSetupInput {
  // AQL % values are 0..99.99, max 2 decimals (matches NUMERIC(4,2) column).
  @IsNumber()
  @Min(0)
  @Max(99.99)
  @MaxDecimalPlaces(2)
  defaultAqlMajor!: number;

  @IsNumber()
  @Min(0)
  @Max(99.99)
  @MaxDecimalPlaces(2)
  defaultAqlMinor!: number;

  @IsString()
  inspectionLevel!: string;

  @IsOptional()
  @IsBoolean()
  autoFailOnCritical?: boolean;

  @IsOptional()
  @IsBoolean()
  strictMode?: boolean;

  // Whole-number defect cap; large enough to allow any realistic batch.
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(100000)
  maxAllowedDefects?: number;
}

export class CreateCategoryDto {
  @IsString()
  @MinLength(2)
  name!: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => CategoryAqlSetupInput)
  aqlSetup?: CategoryAqlSetupInput;
}

export class UpdateCategoryDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  description?: string | null;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class UpdateCategoryAqlDto extends CategoryAqlSetupInput {}
