import {
  IsBoolean,
  IsNumber,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';
import { VENDOR_ID_REGEX } from '../../database/entities/supplier.entity';

export class CreateSupplierDto {
  @IsString()
  @MinLength(2)
  @MaxLength(32)
  @Matches(VENDOR_ID_REGEX, {
    message: 'vendorId must match format VEN-XXXXXX (e.g. VEN-005036)',
  })
  vendorId!: string;

  @IsString()
  @MinLength(2)
  name!: string;

  @IsOptional()
  @IsBoolean()
  requireDoubleInspection?: boolean;

  @IsOptional()
  @IsNumber()
  autoDebitNoteLimit?: number;

  @IsOptional()
  @IsString()
  notes?: string;
}

export class UpdateSupplierDto {
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(32)
  @Matches(VENDOR_ID_REGEX, {
    message: 'vendorId must match format VEN-XXXXXX (e.g. VEN-005036)',
  })
  vendorId?: string;

  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsBoolean()
  requireDoubleInspection?: boolean;

  @IsOptional()
  @IsNumber()
  autoDebitNoteLimit?: number;

  @IsOptional()
  @IsString()
  notes?: string | null;
}
