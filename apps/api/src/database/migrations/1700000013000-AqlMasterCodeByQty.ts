import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Refactor AQL Master table:
 *   1. Drop `code_letter` (single A-Z char) — code is now auto-derived from
 *      min/max qty as `${minQty}-${maxQty}` (e.g. 2-8, 151-280).
 *   2. Drop `minor_ac` and `minor_re` — only Major Ac/Re is required.
 *   3. Keep `sample_size` column but the UI now displays it as "Inspect Qty".
 *
 * Note: this is purely a schema refactor. The runtime AQL sampling engine
 * (apps/api/src/common/aql.ts) and the per-inspection snapshot fields on
 * the `inspections` table are intentionally untouched — those are independent
 * of the AQL Master reference table.
 */
export class AqlMasterCodeByQty1700000013000 implements MigrationInterface {
  name = 'AqlMasterCodeByQty1700000013000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // 1. Drop the minor Ac/Re columns.
    await queryRunner.query(`ALTER TABLE "aql_master" DROP COLUMN "minor_ac"`);
    await queryRunner.query(`ALTER TABLE "aql_master" DROP COLUMN "minor_re"`);

    // 2. Drop the unique constraint on code_letter and the column itself.
    await queryRunner.query(
      `ALTER TABLE "aql_master" DROP CONSTRAINT "uq_aql_master_code_letter"`,
    );
    await queryRunner.query(
      `ALTER TABLE "aql_master" DROP COLUMN "code_letter"`,
    );

    // 3. Add a unique constraint on (min_qty, max_qty) so each lot-size range
    //    appears at most once. Code is derived from these two values.
    await queryRunner.query(
      `ALTER TABLE "aql_master" ADD CONSTRAINT "uq_aql_master_qty_range" UNIQUE ("min_qty", "max_qty")`,
    );

    // 4. Update the existing qty-range index to be unique-aware.
    await queryRunner.query(`DROP INDEX IF EXISTS "ix_aql_master_qty_range"`);
    await queryRunner.query(
      `CREATE INDEX "ix_aql_master_qty_range" ON "aql_master" ("min_qty", "max_qty")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Re-add code_letter + minor columns. Populate code_letter from min-max for
    // existing rows; we just use the FIRST letter of the description (e.g. "A"
    // for "Lot size 2-8"). This is only run for dev/test rollback — the live
    // prod data is not expected to use this path.
    await queryRunner.query(
      `DROP INDEX IF EXISTS "ix_aql_master_qty_range"`,
    );
    await queryRunner.query(
      `ALTER TABLE "aql_master" ADD COLUMN "code_letter" varchar(2)`,
    );
    await queryRunner.query(
      `UPDATE "aql_master" SET "code_letter" = UPPER(LEFT("description", 1))`,
    );
    await queryRunner.query(
      `ALTER TABLE "aql_master" ALTER COLUMN "code_letter" SET NOT NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE "aql_master" ADD CONSTRAINT "uq_aql_master_code_letter" UNIQUE ("code_letter")`,
    );
    await queryRunner.query(
      `ALTER TABLE "aql_master" ADD COLUMN "minor_ac" integer NOT NULL DEFAULT 0`,
    );
    await queryRunner.query(
      `ALTER TABLE "aql_master" ADD COLUMN "minor_re" integer NOT NULL DEFAULT 1`,
    );
    await queryRunner.query(
      `ALTER TABLE "aql_master" DROP CONSTRAINT "uq_aql_master_qty_range"`,
    );
    await queryRunner.query(
      `CREATE INDEX "ix_aql_master_qty_range" ON "aql_master" ("min_qty", "max_qty")`,
    );
  }
}
