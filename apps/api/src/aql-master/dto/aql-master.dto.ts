import {
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';

/**
 * AQL Master now keys on the lot-size range (min/max qty). The user-visible
 * "Code" is auto-derived in the service as `${minQty}-${maxQty}` — there is no
 * codeLetter input on the DTO.
 *
 * Pass/Reject counts are intentionally NOT on this DTO: they are derived at
 * runtime by `calculateSampling()` (common/aql.ts) from the picked
 * sampleSize and AQL limit.
 */
export class CreateAqlMasterDto {
  @IsInt()
  @Min(0)
  @Max(1_000_000)
  minQty!: number;

  @IsInt()
  @Min(1)
  @Max(10_000_000)
  maxQty!: number;

  @IsInt()
  @Min(1)
  @Max(100_000)
  sampleSize!: number;

  @IsOptional()
  @IsString()
  description?: string | null;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class UpdateAqlMasterDto {
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(1_000_000)
  minQty?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(10_000_000)
  maxQty?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100_000)
  sampleSize?: number;

  @IsOptional()
  @IsString()
  description?: string | null;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}