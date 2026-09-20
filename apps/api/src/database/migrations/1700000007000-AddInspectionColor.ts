import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddInspectionColor1700000007000 implements MigrationInterface {
  name = 'AddInspectionColor1700000007000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "inspections" ADD COLUMN "color" varchar(128) NOT NULL DEFAULT ''`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "inspections" DROP COLUMN IF EXISTS "color"`,
    );
  }
}
