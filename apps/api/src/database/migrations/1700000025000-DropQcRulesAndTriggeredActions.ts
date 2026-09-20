import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Drop the `qc_rules` table and the `triggered_actions` column on
 * `inspections`.
 *
 * The QC Rules feature was retired on 2026-09-03. The rules engine
 * (auto-quarantine lots, issue debit notes, escalate to directors,
 * flag high-risk suppliers) wasn't wired into any user-facing flow
 * and added cognitive overhead to the admin nav. All backend code
 * (RulesController / RulesService / RulesEngine / QcRuleEntity /
 * rules.module) and all UI code (Sidebar link / /rules page /
 * RulesEditor / "Triggered actions" block on the inspection detail
 * page) have been removed in the same change.
 *
 *   - qc_rules: independent table (no FK references in the schema),
 *     so a plain DROP TABLE IF EXISTS is safe.
 *
 *   - triggered_actions: jsonb column on inspections. Inspections
 *     already in the database may have data in this column, but since
 *     no UI or report renders it anymore the data is dead weight.
 *     DROP COLUMN IF EXISTS is safe.
 *
 * The down migration is intentionally not provided — restoring QC
 * Rules requires reintroducing QcRuleEntity + RulesModule + the UI
 * page, which is a multi-file restore from git history, not a
 * reversible schema operation.
 */
export class DropQcRulesAndTriggeredActions1700000025000
  implements MigrationInterface
{
  name = 'DropQcRulesAndTriggeredActions1700000025000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // 1. Drop the qc_rules table + its index. CASCADE isn't needed
    //    (the table has no FK references), but it doesn't hurt.
    await queryRunner.query(`DROP TABLE IF EXISTS "qc_rules" CASCADE`);
    await queryRunner.query(
      `DROP INDEX IF EXISTS "ix_qc_rules_enabled"`,
    );

    // 2. Drop the triggered_actions jsonb column on inspections. The
    //    detail-report builder, the web inspection detail page, and
    //    InspectionsService.create() no longer touch this column.
    await queryRunner.query(
      `ALTER TABLE "inspections" DROP COLUMN IF EXISTS "triggered_actions"`,
    );
  }

  public async down(_queryRunner: QueryRunner): Promise<void> {
    throw new Error(
      'Cannot automatically revert DropQcRulesAndTriggeredActions — ' +
        'restore QC Rules module + entity + UI from git history.',
    );
  }
}
