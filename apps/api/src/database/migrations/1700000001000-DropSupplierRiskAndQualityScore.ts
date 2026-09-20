import { MigrationInterface, QueryRunner } from 'typeorm';

export class DropSupplierRiskAndQualityScore1700000001000
  implements MigrationInterface
{
  name = 'DropSupplierRiskAndQualityScore1700000001000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "suppliers" DROP COLUMN IF EXISTS "risk_tier"`);
    await queryRunner.query(`ALTER TABLE "suppliers" DROP COLUMN IF EXISTS "quality_score"`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "suppliers" ADD COLUMN "risk_tier" varchar(32) NOT NULL DEFAULT 'MEDIUM'`,
    );
    await queryRunner.query(
      `ALTER TABLE "suppliers" ADD COLUMN "quality_score" integer NOT NULL DEFAULT 75`,
    );
  }
}
