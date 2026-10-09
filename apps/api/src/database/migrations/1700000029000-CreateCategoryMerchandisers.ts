import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateCategoryMerchandisers1700000029000
  implements MigrationInterface
{
  name = 'CreateCategoryMerchandisers1700000029000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "category_merchandisers" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "category_id" uuid NOT NULL,
        "merchandiser_id" uuid NOT NULL,
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_category_merchandisers_id" PRIMARY KEY ("id"),
        CONSTRAINT "uq_category_merchandisers_category_merchandiser"
          UNIQUE ("category_id", "merchandiser_id"),
        CONSTRAINT "FK_category_merchandisers_category"
          FOREIGN KEY ("category_id") REFERENCES "product_categories"("id")
          ON DELETE CASCADE ON UPDATE NO ACTION,
        CONSTRAINT "FK_category_merchandisers_merchandiser"
          FOREIGN KEY ("merchandiser_id") REFERENCES "merchandisers"("id")
          ON DELETE CASCADE ON UPDATE NO ACTION
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "ix_category_merchandisers_merchandiser" ON "category_merchandisers" ("merchandiser_id")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "category_merchandisers"`);
  }
}
