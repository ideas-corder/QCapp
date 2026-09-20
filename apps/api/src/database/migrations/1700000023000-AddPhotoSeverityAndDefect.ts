import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Per-defect photos for the New Inspection form's Step 8 "Defects captured"
 * card.
 *
 * Behaviour change:
 *   When the inspector clicks the green "Add" button on a defect row
 *   (Severity + Qty + Description), at least one supporting photo must
 *   be attached. Multiple photos per defect are allowed. Each uploaded
 *   photo is stored on the existing `photos` table and tagged with the
 *   defect's severity (MAJOR / MINOR) so downstream PDF generation can
 *   group them separately. The photo's defect row id is also persisted
 *   so a future defect-detail page can re-attach the photo to the
 *   specific defect entry it documents.
 *
 * Columns added:
 *   - photos.severity    varchar(16) NULL
 *       The severity the photo documents: 'MAJOR' or 'MINOR' for
 *       defect photos; NULL for the existing carton / evaluation /
 *       debit-note kinds. NOT NULL DEFAULT was avoided so the column
 *       is purely additive and the migration can be replayed safely
 *       even after back-filling.
 *   - photos.defect_id   uuid NULL
 *       FK into defect_items.id. Optional — NULL for non-defect
 *       photos and for legacy defect photos back-filled before this
 *       column existed. Indexed so per-defect photo queries stay fast.
 */
export class AddPhotoSeverityAndDefect1700000023000 implements MigrationInterface {
  name = 'AddPhotoSeverityAndDefect1700000023000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "photos" ADD COLUMN "severity" varchar(16) NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE "photos" ADD COLUMN "defect_id" uuid NULL`,
    );
    await queryRunner.query(
      `CREATE INDEX "ix_photos_defect" ON "photos" ("defect_id")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "ix_photos_defect"`);
    await queryRunner.query(`ALTER TABLE "photos" DROP COLUMN "defect_id"`);
    await queryRunner.query(`ALTER TABLE "photos" DROP COLUMN "severity"`);
  }
}