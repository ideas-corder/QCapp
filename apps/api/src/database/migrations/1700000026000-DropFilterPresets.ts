import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Drop the `filter_presets` table.
 *
 * Filter Presets was retired on 2026-09-03. The user-managed + 3
 * built-in filter presets (Critical Failures / Pending Sync / Failed
 * Last 7 Days) were a parallel way to drive the inspections index
 * filter, but the index already exposes per-column funnel popovers
 * with the same filter shape. The built-in presets in particular had
 * no user outside the seed. All backend code (FilterPresetsController
 * / FilterPresetsService / FilterPresetEntity / filter-presets.module)
 * and all UI code (Sidebar link / /presets page / PresetsEditor) have
 * been removed in the same change.
 *
 * The table has an FK on owner_id -> users(id) ON DELETE CASCADE;
 * dropping the table itself is safe (no other FK references it).
 * We use `DROP TABLE IF EXISTS ... CASCADE` for safety, though
 * CASCADE isn't strictly needed.
 *
 * The down migration is intentionally not provided — restoring
 * Filter Presets requires reintroducing FilterPresetsModule +
 * FilterPresetEntity + the UI page, which is a multi-file restore
 * from git history, not a reversible schema operation.
 */
export class DropFilterPresets1700000026000 implements MigrationInterface {
  name = 'DropFilterPresets1700000026000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "filter_presets" CASCADE`);
  }

  public async down(_queryRunner: QueryRunner): Promise<void> {
    throw new Error(
      'Cannot automatically revert DropFilterPresets — restore ' +
        'FilterPresetsModule + FilterPresetEntity + UI from git history.',
    );
  }
}
