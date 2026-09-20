import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Step 8 of the New Inspection form ("Debit note") captures whether the
 * inspector raised a debit note against the supplier and, if so, the
 * free-text reasoning behind it. The form's UX hides the comment textarea
 * until the inspector picks "Yes" so a No answer doesn't carry empty
 * comments.
 *
 * The table already had a legacy `debit_note` column of type
 * varchar(255), used by an older revision of the form that treated the
 * debit note as a free-form string. It was never wired to the UI in
 * this codebase — nothing in the web form populates it today — so we
 * drop it as part of this migration and recreate the column as JSONB
 * with the structured `{ answer, comment }` shape the new form sends.
 *
 * Net result on the schema:
 *   - drop inspections.debit_note (varchar(255))
 *   - add  inspections.debit_note (jsonb, NOT NULL DEFAULT '{}'::jsonb)
 *       Shape:
 *         {
 *           answer:  '' | 'YES' | 'NO',
 *           comment: string,   // required when answer === 'YES'
 *         }
 *
 * Data preservation: there are no rows in the existing dev / staging
 * DBs that carry meaningful text in the legacy column, so the drop is
 * safe. (If we ever need to preserve historic data we'd add a
 * CASE-style backfill here.)
 */
export class AddDebitNote1700000018000 implements MigrationInterface {
  name = 'AddDebitNote1700000018000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "inspections" DROP COLUMN "debit_note"`);
    await queryRunner.query(
      `ALTER TABLE "inspections" ADD COLUMN "debit_note" jsonb NOT NULL DEFAULT '{}'::jsonb`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "inspections" DROP COLUMN "debit_note"`);
    await queryRunner.query(
      `ALTER TABLE "inspections" ADD COLUMN "debit_note" varchar(255) NOT NULL DEFAULT ''`,
    );
  }
}
