import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateMerchandisers1700000028000 implements MigrationInterface {
  name = 'CreateMerchandisers1700000028000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "merchandisers" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "name" varchar(255) NOT NULL,
        "email" varchar(255) NOT NULL,
        "description" text,
        "is_active" boolean NOT NULL DEFAULT TRUE,
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_merchandisers_id" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(
      `CREATE UNIQUE INDEX "uq_merchandisers_email" ON "merchandisers" ("email")`,
    );
    await queryRunner.query(
      `CREATE INDEX "ix_merchandisers_active" ON "merchandisers" ("is_active")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "merchandisers"`);
  }
}
