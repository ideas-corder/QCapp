import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Make `inspections.category_id` nullable.
 *
 * The legacy categories master was a hard gate on the New Inspection
 * form (Step 1) and on the server DTO, but the user explicitly wiped
 * the categories table out of the system. Forcing them to keep a
 * legacy "category" row on every inspection would defeat the wipe —
 * it would re-introduce exactly the dead reference they removed.
 *
 * The downstream pieces are still safe with NULL:
 *   - InspectionEntity.category uses @ManyToOne with `nullable: true`
 *     after the entity update below, so TypeORM doesn't try to JOIN a
 *     row that isn't there.
 *   - The Category relation is `eager: true` for the report PDF; we
 *     conditionally render the Category line on the report instead of
 *     assuming it's always present (the builder checks `i.category`).
 *   - The Category AQL setup was the link from category → AQL limits;
 *     since the user wiped categories, that linkage is gone too, and
 *     sampling math is now derived from aql_master rows only.
 *
 * `supplier_id` and `product_category_id` are NOT changed here — the
 * supplier relation is still required (no suppliers exist either in
 * the user's master, but they're separately seeded/loaded and
 * business-critical). Only the now-defunct category reference is
 * released.
 */
export class MakeCategoryIdOptional1700000024000 implements MigrationInterface {
  name = 'MakeCategoryIdOptional1700000024000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "inspections" ALTER COLUMN "category_id" DROP NOT NULL`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Down migration is unsafe (existing NULL rows would block), so we
    // refuse to flip it back automatically — operators can run it by
    // hand after back-filling nulls.
    throw new Error(
      'Cannot automatically revert inspections.category_id to NOT NULL — backfill nulls first.',
    );
  }
}