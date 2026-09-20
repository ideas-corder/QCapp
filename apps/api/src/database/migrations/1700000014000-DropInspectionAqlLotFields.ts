import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Remove the four legacy AQL/lot fields from the `inspections` table —
 * they are now derived from the picked `aql_master` row (sampleSize,
 * majorAc, majorRe) and the picked `category.aqlSetup` (inspectionLevel,
 * aqlLimitMajor, aqlLimitMinor), so storing them per-inspection is
 * redundant.
 *
 * Columns dropped:
 *   - lot_size          (replaced by aql_master row's min_qty/max_qty range)
 *   - inspection_level  (now on Category.aqlSetup)
 *   - aql_limit_major   (now on Category.aqlSetup)
 *   - aql_limit_minor   (now on Category.aqlSetup)
 *
 * NOTE: This migration is destructive — historical inspection rows will
 * lose the values of these four columns. Run `down()` to restore them as
 * empty strings / 0 (no way to recover the original data).
 */
export class DropInspectionAqlLotFields1700000014000
  implements MigrationInterface
{
  name = 'DropInspectionAqlLotFields1700000014000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // 1. Drop the four legacy AQL/lot columns.
    await queryRunner.query(`ALTER TABLE "inspections" DROP COLUMN "lot_size"`);
    await queryRunner.query(
      `ALTER TABLE "inspections" DROP COLUMN "inspection_level"`,
    );
    await queryRunner.query(
      `ALTER TABLE "inspections" DROP COLUMN "aql_limit_major"`,
    );
    await queryRunner.query(
      `ALTER TABLE "inspections" DROP COLUMN "aql_limit_minor"`,
    );

    // 2. Add the new aql_master_id FK column. Backfill any existing rows
    //    to the first active AQL master row so NOT NULL is satisfiable.
    await queryRunner.query(
      `ALTER TABLE "inspections" ADD COLUMN "aql_master_id" uuid`,
    );
    const fallback = await queryRunner.query(
      `SELECT id FROM "aql_master" WHERE "is_active" = true ORDER BY "min_qty" ASC LIMIT 1`,
    );
    if (fallback.length > 0) {
      await queryRunner.query(
        `UPDATE "inspections" SET "aql_master_id" = $1 WHERE "aql_master_id" IS NULL`,
        [fallback[0].id],
      );
    }
    await queryRunner.query(
      `ALTER TABLE "inspections" ALTER COLUMN "aql_master_id" SET NOT NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE "inspections" ADD CONSTRAINT "fk_inspections_aql_master" FOREIGN KEY ("aql_master_id") REFERENCES "aql_master"("id") ON DELETE RESTRICT`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "inspections" DROP CONSTRAINT IF EXISTS "fk_inspections_aql_master"`,
    );
    await queryRunner.query(
      `ALTER TABLE "inspections" DROP COLUMN "aql_master_id"`,
    );
    await queryRunner.query(
      `ALTER TABLE "inspections" ADD COLUMN "lot_size" integer NOT NULL DEFAULT 0`,
    );
    await queryRunner.query(
      `ALTER TABLE "inspections" ADD COLUMN "inspection_level" varchar(32) NOT NULL DEFAULT ''`,
    );
    await queryRunner.query(
      `ALTER TABLE "inspections" ADD COLUMN "aql_limit_major" numeric(4,2) NOT NULL DEFAULT 0`,
    );
    await queryRunner.query(
      `ALTER TABLE "inspections" ADD COLUMN "aql_limit_minor" numeric(4,2) NOT NULL DEFAULT 0`,
    );
  }
}
