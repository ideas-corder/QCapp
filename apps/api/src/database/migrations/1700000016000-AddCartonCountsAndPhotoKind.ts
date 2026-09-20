import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Step 7 of the New Inspection form requires two carton-level counters and
 * two photo kinds in addition to the existing per-unit quantities.
 *
 * Columns added:
 *   - inspections.total_cartons      (int, NOT NULL DEFAULT 0)
 *       Total cartons in the lot being inspected. Required on the form.
 *   - inspections.inspected_cartons  (int, NOT NULL DEFAULT 0)
 *       How many of those cartons were actually opened / inspected.
 *       Required on the form. Integer-only — the form rejects decimals.
 *   - photos.kind                    (varchar(32), NOT NULL DEFAULT 'INSPECTION')
 *       Distinguishes the new carton-level photos from the existing
 *       defect / inspection-context photos. Allowed values on the API:
 *         'CARTON_UPLOAD'   — cartons as they arrived (Step 7)
 *         'CARTON_INSPECT'  — cartons during inspection (Step 7)
 *         'INSPECTION'      — legacy / everything else (default)
 *
 * Both carton counters are NOT NULL with a 0 default so the migration is
 * safe on the existing inspections table; the form will backfill on the
 * next edit / new inspection.
 */
export class AddCartonCountsAndPhotoKind1700000016000
  implements MigrationInterface
{
  name = 'AddCartonCountsAndPhotoKind1700000016000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "inspections" ADD COLUMN "total_cartons" integer NOT NULL DEFAULT 0`,
    );
    await queryRunner.query(
      `ALTER TABLE "inspections" ADD COLUMN "inspected_cartons" integer NOT NULL DEFAULT 0`,
    );
    await queryRunner.query(
      `ALTER TABLE "photos" ADD COLUMN "kind" varchar(32) NOT NULL DEFAULT 'INSPECTION'`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "photos" DROP COLUMN "kind"`);
    await queryRunner.query(
      `ALTER TABLE "inspections" DROP COLUMN "inspected_cartons"`,
    );
    await queryRunner.query(
      `ALTER TABLE "inspections" DROP COLUMN "total_cartons"`,
    );
  }
}