import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddQualityQuantity1700000011000 implements MigrationInterface {
  name = 'AddQualityQuantity1700000011000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "inspections" ADD COLUMN "order_quantity" numeric(14,2) NOT NULL DEFAULT 0`,
    );
    await queryRunner.query(
      `ALTER TABLE "inspections" ADD COLUMN "presented_quantity" numeric(14,2) NOT NULL DEFAULT 0`,
    );
    await queryRunner.query(
      `ALTER TABLE "inspections" ADD COLUMN "inspected_quantity" numeric(14,2) NOT NULL DEFAULT 0`,
    );
    await queryRunner.query(
      `ALTER TABLE "inspections" ADD COLUMN "fabric_quality" varchar(255) NOT NULL DEFAULT ''`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "inspections" DROP COLUMN IF EXISTS "fabric_quality"`,
    );
    await queryRunner.query(
      `ALTER TABLE "inspections" DROP COLUMN IF EXISTS "inspected_quantity"`,
    );
    await queryRunner.query(
      `ALTER TABLE "inspections" DROP COLUMN IF EXISTS "presented_quantity"`,
    );
    await queryRunner.query(
      `ALTER TABLE "inspections" DROP COLUMN IF EXISTS "order_quantity"`,
    );
  }
}
