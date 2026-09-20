import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddInspectionType1700000003000 implements MigrationInterface {
  name = 'AddInspectionType1700000003000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Add column with DB default so existing rows are filled with 'FINAL'.
    // The TypeORM entity also has default: 'FINAL' for new rows.
    await queryRunner.query(
      `ALTER TABLE "inspections" ADD COLUMN "inspection_type" varchar(16) NOT NULL DEFAULT 'FINAL'`,
    );
    await queryRunner.query(
      `ALTER TABLE "inspections" ADD CONSTRAINT "ck_inspections_inspection_type" CHECK ("inspection_type" IN ('INLINE', 'FINAL'))`,
    );
    await queryRunner.query(
      `CREATE INDEX "ix_inspections_type" ON "inspections" ("inspection_type")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "ix_inspections_type"`);
    await queryRunner.query(
      `ALTER TABLE "inspections" DROP CONSTRAINT IF EXISTS "ck_inspections_inspection_type"`,
    );
    await queryRunner.query(
      `ALTER TABLE "inspections" DROP COLUMN IF EXISTS "inspection_type"`,
    );
  }
}
