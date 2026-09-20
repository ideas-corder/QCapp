import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddMerchandiserName1700000010000 implements MigrationInterface {
  name = 'AddMerchandiserName1700000010000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "inspections" ADD COLUMN "merchandiser_name" varchar(255) NOT NULL DEFAULT ''`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "inspections" DROP COLUMN IF EXISTS "merchandiser_name"`,
    );
  }
}
