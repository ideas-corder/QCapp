import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Human-readable "Inspection Document Number" on the inspections table.
 *
 * Format: `QC-YYMMDD-NNNN` where:
 *  - `QC-` is a fixed prefix (the project / client code can be swapped
 *    later via a config knob without a schema change),
 *  - `YYMMDD` is the date the row was first persisted (taken from
 *    `created_at`, falling back to `inspection_date`, then to today),
 *  - `NNNN` is a zero-padded per-day counter, ordered by the row's
 *    `created_at` so the numbering is stable across runs.
 *
 * The column is unique so two submissions can't collide; we add the
 * unique index after the backfill so we don't trip on duplicate
 * placeholders during the backfill itself.
 *
 * Existing rows get a deterministic backfilled value computed by
 * `row_number()` over `created_at` (tied with `id` to keep the order
 * deterministic). New rows get a value auto-assigned by the service
 * on insert (see `InspectionsService.create()`).
 */
export class AddInspectionNumber1700000022000 implements MigrationInterface {
  name = 'AddInspectionNumber1700000022000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // 1) Add the column nullable so we can backfill without violating
    //    a NOT NULL constraint on existing rows.
    await queryRunner.query(`
      ALTER TABLE "inspections"
      ADD COLUMN "inspection_number" varchar(32) NULL
    `);

    // 2) Backfill deterministic values for existing rows. We partition
    //    by the calendar day of `created_at` so each day has its own
    //    counter starting at 1. The tie-break on `id` keeps numbering
    //    stable when two rows share the same `created_at` timestamp.
    //
    //    `inspection_date` is a real `date` column, so we just check
    //    IS NOT NULL and cast through `text` to get a stable partition
    //    key for `ROW_NUMBER() OVER (...)`. Rows where `inspection_date`
    //    is null fall back to the calendar day of `created_at`.
    await queryRunner.query(`
      WITH day_keys AS (
        SELECT
          id,
          created_at,
          CASE
            WHEN inspection_date IS NOT NULL
              THEN TO_CHAR(inspection_date, 'YYYY-MM-DD')
            ELSE TO_CHAR(created_at::date, 'YYYY-MM-DD')
          END AS day_key
        FROM inspections
      ),
      base AS (
        SELECT
          id,
          TO_CHAR(day_key::date, 'YYMMDD') AS yymmdd,
          ROW_NUMBER() OVER (
            PARTITION BY day_key
            ORDER BY created_at ASC, id ASC
          ) AS seq
        FROM day_keys
      )
      UPDATE inspections i
      SET "inspection_number" = 'QC-' || base.yymmdd || '-' || LPAD(base.seq::text, 4, '0')
      FROM base
      WHERE i.id = base.id
    `);

    // 3) Lock the column down: NOT NULL + unique. Any subsequent row
    //    that doesn't have a value gets one from the service.
    await queryRunner.query(`
      ALTER TABLE "inspections"
      ALTER COLUMN "inspection_number" SET NOT NULL
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX "ix_inspections_inspection_number"
      ON "inspections" ("inspection_number")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX IF EXISTS "ix_inspections_inspection_number"`,
    );
    await queryRunner.query(
      `ALTER TABLE "inspections" DROP COLUMN IF EXISTS "inspection_number"`,
    );
  }
}
