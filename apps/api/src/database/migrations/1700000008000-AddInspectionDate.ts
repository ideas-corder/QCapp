import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddInspectionDate1700000008000 implements MigrationInterface {
  name = 'AddInspectionDate1700000008000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "inspections" ADD COLUMN "inspection_date" date NULL`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "inspections" DROP COLUMN IF EXISTS "inspection_date"`,
    );
  }
}
