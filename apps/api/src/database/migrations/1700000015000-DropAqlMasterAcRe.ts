import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Drop the `major_ac` and `major_re` columns from `aql_master`.
 *
 * The user's AQL workflow no longer exposes Pass (Ac) / Reject (Re) as
 * per-bucket fields — they are computed at runtime by `calculateSampling()`
 * in `common/aql.ts` from the sample size + the chosen AQL limit, so
 * storing them on each plan row is redundant (and the values stored were
 * identical to what the runtime calculator already produces).
 *
 * This affects:
 *   - aql_master.major_ac
 *   - aql_master.major_re
 *
 * Existing 16 rows will lose the stored values (no way to recover).
 * The runtime sampling engine (`apps/api/src/common/aql.ts`) keeps
 * computing these per inspection.
 *
 * Companion changes (no DB impact):
 *   - AqlMasterEntity drops the two @Column fields
 *   - CreateAqlMasterDto / UpdateAqlMasterDto drop majorAc / majorRe
 *   - AqlMasterService drops the Ac/Re fields from validation, create,
 *     update, and bulk-import (incl. the `Ac >= Re` guard)
 *   - InspectionsService.create() falls back to runtime defaults
 *     (majorAc = 0, majorRe = 1) since the values used to be copied
 *     from the picked aql_master row
 *   - Web admin form (AqlMasterEditor.tsx) and CSV bulk-import template
 *     no longer carry the columns
 *   - Mobile (Flutter) local_db.dart drops the same columns
 */
export class DropAqlMasterAcRe1700000015000 implements MigrationInterface {
  name = 'DropAqlMasterAcRe1700000015000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "aql_master" DROP COLUMN "major_ac"`);
    await queryRunner.query(`ALTER TABLE "aql_master" DROP COLUMN "major_re"`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "aql_master" ADD COLUMN "major_ac" integer NOT NULL DEFAULT 0`,
    );
    await queryRunner.query(
      `ALTER TABLE "aql_master" ADD COLUMN "major_re" integer NOT NULL DEFAULT 1`,
    );
  }
}