import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Saved views for the Inspections grid.
 *
 *  - column order
 *  - which columns are hidden
 *  - per-column pixel widths (drag-resize)
 *  - (optional) the sort + filter state the view was saved under
 *
 * One row per named view, owned by a user. The "Default" built-in is
 * seeded by `InspectionViewsService.seedBuiltIn()` so every account
 * starts with one usable view.
 *
 * The `layout` JSONB column is the entire persistence surface — the
 * front-end is the authority on which column keys are valid. New
 * columns added later will simply be ignored by older views, then
 * become visible again when the user re-saves.
 */
export class AddInspectionViews1700000021000 implements MigrationInterface {
  name = 'AddInspectionViews1700000021000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "inspection_views" (
        "id"          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "name"        varchar(120) NOT NULL,
        "description" text NOT NULL DEFAULT '',
        "is_built_in" boolean NOT NULL DEFAULT false,
        "layout"      jsonb NOT NULL DEFAULT '{}'::jsonb,
        "owner_id"    uuid NULL REFERENCES "users"("id") ON DELETE CASCADE,
        "created_at"  TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at"  TIMESTAMP NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "ix_inspection_views_owner" ON "inspection_views" ("owner_id")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "inspection_views"`);
  }
}