import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Two new tables to support the "Detail submission report" feature
 * (record-keeping / audit + manual email).
 *
 * `reports`:
 *   - one row per generated PDF (auto-archive, manual download,
 *     email attachment). Stores the on-disk path + SHA-256 hash so
 *     admins can prove the file hasn't been tampered with since
 *     generation.
 *
 * `email_events`:
 *   - audit trail for every "email detail report" action. `recipients`
 *     is JSONB so we don't need a join table for what is effectively
 *     an immutable snapshot of who got the report at the time it was
 *     sent. `eml_path` points at the .eml drop file (in mock / dev
 *     mode) so admins can re-open the exact message that went out.
 *
 * No FK to inspections — soft coupling by id keeps the audit trail
 * intact even if an inspection row is later pruned.
 */
export class AddReportsAndEmailEvents1700000020000 implements MigrationInterface {
  name = 'AddReportsAndEmailEvents1700000020000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "reports" (
        "id"            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "inspection_id" uuid NOT NULL,
        "kind"          varchar(32) NOT NULL,
        "sha256"        varchar(64) NOT NULL DEFAULT '',
        "byte_size"     integer NOT NULL DEFAULT 0,
        "storage_path"  varchar(512) NOT NULL,
        "page_count"    integer NOT NULL DEFAULT 0,
        "generated_by"  uuid NULL,
        "created_at"    TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at"    TIMESTAMP NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "ix_reports_inspection" ON "reports" ("inspection_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX "ix_reports_inspection_kind" ON "reports" ("inspection_id", "kind")`,
    );

    await queryRunner.query(`
      CREATE TABLE "email_events" (
        "id"                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "inspection_id"      uuid NOT NULL,
        "report_id"          uuid NOT NULL,
        "subject"            varchar(255) NOT NULL,
        "body"               text NOT NULL DEFAULT '',
        "recipients"         jsonb NOT NULL DEFAULT '[]'::jsonb,
        "recipient_summary"  varchar(1024) NOT NULL DEFAULT '',
        "status"             varchar(16) NOT NULL DEFAULT 'QUEUED',
        "error_message"      text NULL,
        "sent_by"            uuid NULL,
        "eml_path"           varchar(512) NULL,
        "created_at"         TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at"         TIMESTAMP NOT NULL DEFAULT now(),
        "sent_at"            TIMESTAMP NULL
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "ix_email_events_inspection" ON "email_events" ("inspection_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX "ix_email_events_report" ON "email_events" ("report_id")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "email_events"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "reports"`);
  }
}
