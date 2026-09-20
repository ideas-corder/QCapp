import { MigrationInterface, QueryRunner } from 'typeorm';

export class InspectionTypeMaster1700000004000 implements MigrationInterface {
  name = 'InspectionTypeMaster1700000004000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // 1. Master table for inspection types.
    await queryRunner.query(`
      CREATE TABLE "inspection_types" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "code" varchar(32) NOT NULL,
        "label" varchar(255) NOT NULL,
        "description" text,
        "is_active" boolean NOT NULL DEFAULT true,
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "pk_inspection_types" PRIMARY KEY ("id"),
        CONSTRAINT "uq_inspection_types_code" UNIQUE ("code")
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "ix_inspection_types_active" ON "inspection_types" ("is_active")`,
    );

    // 2. Seed the existing two codes so the master isn't empty.
    await queryRunner.query(
      `INSERT INTO "inspection_types" ("code", "label", "description", "is_active")
       VALUES
         ('INLINE',  'Inline inspection',  'Inspection performed during production', true),
         ('FINAL',   'Final inspection',   'Pre-shipment inspection of finished lot', true)`,
    );

    // 3. Relax inspections.inspection_type.
    //    Drop the enum-style CHECK constraint that was added by
    //    AddInspectionType1700000003000 so admins can store their own codes.
    await queryRunner.query(
      `ALTER TABLE "inspections" DROP CONSTRAINT IF EXISTS "ck_inspections_inspection_type"`,
    );
    // Ensure the column is wide enough for free-form codes (32 covers
    // PRE-SHIPMENT, RANDOM, etc.). Existing data is preserved.
    await queryRunner.query(
      `ALTER TABLE "inspections" ALTER COLUMN "inspection_type" TYPE varchar(32)`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Re-add the original INLINE/FINAL-only CHECK.
    await queryRunner.query(
      `ALTER TABLE "inspections" ADD CONSTRAINT "ck_inspections_inspection_type"
       CHECK ("inspection_type" IN ('INLINE', 'FINAL'))`,
    );

    await queryRunner.query(`DROP INDEX IF EXISTS "ix_inspection_types_active"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "inspection_types"`);
  }
}