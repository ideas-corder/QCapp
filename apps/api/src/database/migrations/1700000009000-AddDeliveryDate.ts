import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddDeliveryDate1700000009000 implements MigrationInterface {
  name = 'AddDeliveryDate1700000009000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "inspections" ADD COLUMN "delivery_date" date NULL`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "inspections" DROP COLUMN IF EXISTS "delivery_date"`,
    );
  }
}
