import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Adds the dedicated Inspector master (the people who *sign*
 * inspections — independent from the `users` login table).
 *
 * New nullable FK `inspector_master_id` on `inspections` coexists with
 * the existing `inspector_id` (which links to a user account).
 */
export class InspectorMaster1700000006000 implements MigrationInterface {
  name = 'InspectorMaster1700000006000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "inspectors" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "code" varchar(32) NOT NULL,
        "name" varchar(255) NOT NULL,
        "email" varchar(255),
        "phone" varchar(64),
        "notes" text,
        "is_active" boolean NOT NULL DEFAULT true,
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "pk_inspectors" PRIMARY KEY ("id"),
        CONSTRAINT "uq_inspectors_code" UNIQUE ("code")
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "ix_inspectors_active" ON "inspectors" ("is_active")`,
    );

    // Seed a couple of starter inspectors so the dropdown isn't empty
    // after the first deploy. Admins can edit / deactivate freely.
    await queryRunner.query(
      `INSERT INTO "inspectors" ("code", "name", "email", "phone", "notes", "is_active")
       VALUES
         ('INSP-001', 'Owais Siddiqui', 'owais@qc.local', NULL, 'Default admin / QC lead', true),
         ('INSP-002', 'Asma Khan',      'asma@qc.local',   NULL, NULL,                          true),
         ('INSP-003', 'Hassan Ali',     'hassan@qc.local', NULL, NULL,                          true)`,
    );

    await queryRunner.query(
      `ALTER TABLE "inspections" ADD COLUMN "inspector_master_id" uuid`,
    );
    await queryRunner.query(
      `ALTER TABLE "inspections"
       ADD CONSTRAINT "fk_inspections_inspector_master"
       FOREIGN KEY ("inspector_master_id")
       REFERENCES "inspectors"("id")
       ON DELETE SET NULL
       ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `CREATE INDEX "ix_inspections_inspector_master"
       ON "inspections" ("inspector_master_id")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "ix_inspections_inspector_master"`);
    await queryRunner.query(
      `ALTER TABLE "inspections" DROP CONSTRAINT IF EXISTS "fk_inspections_inspector_master"`,
    );
    await queryRunner.query(
      `ALTER TABLE "inspections" DROP COLUMN IF EXISTS "inspector_master_id"`,
    );
    await queryRunner.query(`DROP INDEX IF EXISTS "ix_inspectors_active"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "inspectors"`);
  }
}
