import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Step 6 of the New Inspection form ("Evaluation checks") records the
 * inspector's yes/no answers to a fixed set of pre-shipment readiness
 * checks plus any supporting photos for each "Yes" answer.
 *
 * Column added:
 *   - inspections.evaluation_checks   (jsonb, NOT NULL DEFAULT '[]')
 *       Array of:
 *         {
 *           key:        'INLINE_INSPECTION_DONE' | 'PP_SAMPLE_APPROVED' |
 *                       'IC_AVAILABLE' | 'BARCODE' | 'CARE_LABEL',
 *           label:      string,   // human-readable label, e.g. "Inline Inspection Done"
 *           answer:     'YES' | 'NO',
 *           photoCount: number,   // how many supporting photos are linked
 *           photoUrls:  string[], // uploaded photo URLs (subset of photos.kind='EVAL_*')
 *         }
 *
 * We also reuse the existing `photos.kind` enum by widening it on the API
 * side (no DB migration needed — varchar(32) — the new values are just
 * 'EVAL_INLINE_INSPECTION_DONE', 'EVAL_PP_SAMPLE_APPROVED', etc.). The web
 * form sets `kind` per-question so the existing /photos endpoint stays the
 * single source of truth for binary storage.
 */
export class AddEvaluationChecks1700000017000
  implements MigrationInterface
{
  name = 'AddEvaluationChecks1700000017000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "inspections" ADD COLUMN "evaluation_checks" jsonb NOT NULL DEFAULT '[]'::jsonb`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "inspections" DROP COLUMN "evaluation_checks"`,
    );
  }
}
