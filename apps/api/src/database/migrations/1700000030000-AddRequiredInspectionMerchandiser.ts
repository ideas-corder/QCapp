import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddRequiredInspectionMerchandiser1700000030000
  implements MigrationInterface
{
  name = 'AddRequiredInspectionMerchandiser1700000030000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Expand first so existing inspection rows remain valid while the data is
    // prepared for the final NOT NULL constraint.
    await queryRunner.query(
      `ALTER TABLE "inspections" ADD COLUMN "merchandiser_id" uuid`,
    );

    const [inspectionState] = (await queryRunner.query(`
      SELECT EXISTS (
        SELECT 1 FROM "inspections"
      ) AS "hasExistingInspections"
    `)) as Array<{ hasExistingInspections: boolean }>;

    // A fresh database has nothing to backfill, so do not create sample data.
    // The schema changes below are still applied normally.
    if (inspectionState?.hasExistingInspections === true) {
      // Every category must have at least one option. A category-specific sample
      // is created only when that category currently has no assignment.
      await queryRunner.query(`
      INSERT INTO "merchandisers" (
        "name", "email", "description", "is_active"
      )
      SELECT
        LEFT('Sample Merchandiser - ' || pc."name", 255),
        'sample-category-' || REPLACE(pc."id"::text, '-', '') || '@qcapp.local',
        'Automatically created during required inspection merchandiser backfill.',
        TRUE
      FROM "product_categories" pc
      WHERE NOT EXISTS (
        SELECT 1
        FROM "category_merchandisers" cm
        JOIN "merchandisers" assigned
          ON assigned."id" = cm."merchandiser_id"
        WHERE cm."category_id" = pc."id"
          AND assigned."is_active" = TRUE
      )
      ON CONFLICT ("email") DO UPDATE SET "is_active" = TRUE
    `);

      await queryRunner.query(`
      INSERT INTO "category_merchandisers" (
        "category_id", "merchandiser_id"
      )
      SELECT pc."id", m."id"
      FROM "product_categories" pc
      JOIN "merchandisers" m
        ON m."email" =
          'sample-category-' || REPLACE(pc."id"::text, '-', '') || '@qcapp.local'
      WHERE NOT EXISTS (
        SELECT 1
        FROM "category_merchandisers" cm
        JOIN "merchandisers" assigned
          ON assigned."id" = cm."merchandiser_id"
        WHERE cm."category_id" = pc."id"
          AND assigned."is_active" = TRUE
      )
      ON CONFLICT ("category_id", "merchandiser_id") DO NOTHING
    `);

      // Prefer a merchant matching the old free-text snapshot. When there is no
      // match, choose an active assignment first, then the oldest junction row.
      await queryRunner.query(`
      UPDATE "inspections" i
      SET "merchandiser_id" = (
        SELECT cm."merchandiser_id"
        FROM "category_merchandisers" cm
        JOIN "merchandisers" m ON m."id" = cm."merchandiser_id"
        WHERE cm."category_id" = i."product_category_id"
        ORDER BY
          CASE
            WHEN LOWER(TRIM(m."name")) = LOWER(TRIM(i."merchandiser_name"))
              THEN 0
            ELSE 1
          END,
          m."is_active" DESC,
          cm."created_at" ASC,
          cm."id" ASC
        LIMIT 1
      )
      WHERE i."product_category_id" IS NOT NULL
    `);

      // Older inspections may not have a product category at all. They still
      // need a valid FK before the new column can become required.
      await queryRunner.query(`
      INSERT INTO "merchandisers" (
        "name", "email", "description", "is_active"
      )
      VALUES (
        'Legacy Unassigned Merchandiser',
        'legacy-unassigned@qcapp.local',
        'Fallback for inspections created before merchandiser selection was required.',
        TRUE
      )
      ON CONFLICT ("email") DO UPDATE SET "is_active" = TRUE
    `);

      await queryRunner.query(`
      UPDATE "inspections"
      SET "merchandiser_id" = (
        SELECT "id"
        FROM "merchandisers"
        WHERE "email" = 'legacy-unassigned@qcapp.local'
        LIMIT 1
      )
      WHERE "merchandiser_id" IS NULL
    `);

      // Populate the legacy name snapshot when it was previously blank, while
      // preserving meaningful historical names already stored by inspectors.
      await queryRunner.query(`
      UPDATE "inspections" i
      SET "merchandiser_name" = m."name"
      FROM "merchandisers" m
      WHERE m."id" = i."merchandiser_id"
        AND TRIM(COALESCE(i."merchandiser_name", '')) = ''
    `);
    }

    await queryRunner.query(
      `ALTER TABLE "inspections" ALTER COLUMN "merchandiser_id" SET NOT NULL`,
    );
    await queryRunner.query(`
      ALTER TABLE "inspections"
      ADD CONSTRAINT "FK_inspections_merchandiser"
      FOREIGN KEY ("merchandiser_id") REFERENCES "merchandisers"("id")
      ON DELETE RESTRICT ON UPDATE NO ACTION
    `);
    await queryRunner.query(
      `CREATE INDEX "ix_inspections_merchandiser" ON "inspections" ("merchandiser_id")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "ix_inspections_merchandiser"`);
    await queryRunner.query(
      `ALTER TABLE "inspections" DROP CONSTRAINT IF EXISTS "FK_inspections_merchandiser"`,
    );
    await queryRunner.query(
      `ALTER TABLE "inspections" DROP COLUMN IF EXISTS "merchandiser_id"`,
    );
  }
}
