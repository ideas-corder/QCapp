import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Step 10 of the New Inspection form ("Signatures") captures e-signatures
 * from every stakeholder who has to authorise the lot — the QC
 * inspector, the supplier rep, the AQM, and the merchandiser. Each
 * stakeholder draws their signature on a dedicated canvas; the form
 * forwards the PNG data URL to the API which persists the collection
 * in a new JSONB column.
 *
 * The legacy `signature_base64` text column (single Inspector
 * signature) stays in place for backwards compatibility — rows written
 * before this migration still render their old single signature, and
 * the report / detail page falls back to it when the new column is
 * empty.
 *
 * Net result on the schema:
 *   + add  inspections.signatures (jsonb, NOT NULL DEFAULT '[]'::jsonb)
 *       Shape (one entry per signing stakeholder):
 *         {
 *           role:     'QC_INSPECTOR' | 'SUPPLIER' | 'AQM' | 'MERCHANDISER',
 *           label:    string,   // e.g. "QC Inspector Signature"
 *           dataUrl:  string,   // PNG data URL produced by the canvas
 *           signedAt: string,   // ISO timestamp
 *         }
 */
export class AddSignatures1700000019000 implements MigrationInterface {
  name = 'AddSignatures1700000019000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "inspections" ADD COLUMN "signatures" jsonb NOT NULL DEFAULT '[]'::jsonb`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "inspections" DROP COLUMN "signatures"`);
  }
}
