import { IsObject, IsOptional, IsString, MinLength } from 'class-validator';

/**
 * The view layout is intentionally loosely typed — the front-end is
 * the authority on which column keys are valid, and we don't want a
 * schema bump every time we add a column. The DTO validates only the
 * outer envelope (name, description) and lets the layout pass
 * through untouched.
 *
 * `@IsObject()` on `layout` is required so the global `ValidationPipe`
 * (with `whitelist: true`) recognises the field and keeps its contents
 * instead of stripping them. We deliberately do NOT use
 * `@ValidateNested()` because we want the loose `Record<...>` shape.
 */
export class CreateInspectionViewDto {
  @IsString()
  @MinLength(2)
  name!: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsObject()
  layout!: Record<string, unknown>;
}

export class UpdateInspectionViewDto {
  @IsOptional() @IsString() name?: string;
  @IsOptional() @IsString() description?: string;
  @IsOptional() @IsObject() layout?: Record<string, unknown>;
}