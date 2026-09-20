import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Adds the new "Product Category" master (lightweight, no AQL) and a
 * nullable `product_category_id` column on `inspections`.
 *
 * The legacy `categories` master + `inspections.category_id` column are
 * untouched — both can coexist during the transition. New inspections
 * are expected to populate both fields; the new form drives the
 * product category chip picker, and the legacy category continues to
 * drive AQL defaults.
 */
export class ProductCategoryMaster1700000005000 implements MigrationInterface {
  name = 'ProductCategoryMaster1700000005000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // 1. New master table.
    await queryRunner.query(`
      CREATE TABLE "product_categories" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "code" varchar(64) NOT NULL,
        "name" varchar(255) NOT NULL,
        "description" text,
        "is_active" boolean NOT NULL DEFAULT true,
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "pk_product_categories" PRIMARY KEY ("id"),
        CONSTRAINT "uq_product_categories_code" UNIQUE ("code")
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "ix_product_categories_active" ON "product_categories" ("is_active")`,
    );

    // 2. Seed a handful of sensible starter categories so the chip
    //    picker isn't empty after the first deploy. Admins can edit /
    //    deactivate / delete any of them freely.
    await queryRunner.query(
      `INSERT INTO "product_categories" ("code", "name", "description", "is_active")
       VALUES
         ('APPAREL',   'Apparel',          'Clothing, garments, accessories',         true),
         ('FOOTWEAR',  'Footwear',         'Shoes, boots, slippers',                  true),
         ('ELECTRONICS','Electronics',    'Consumer electronics, accessories',       true),
         ('HOMEWARE',  'Homeware',         'Kitchen, decor, household goods',         true),
         ('TOYS',      'Toys',             'Children toys, games, plush',             true),
         ('BEAUTY',    'Beauty & Personal Care', 'Cosmetics, skincare, grooming',     true)`,
    );

    // 3. Add the new nullable column on inspections. We keep the legacy
    //    `category_id` NOT NULL — that still drives AQL defaults.
    await queryRunner.query(
      `ALTER TABLE "inspections" ADD COLUMN "product_category_id" uuid`,
    );
    await queryRunner.query(
      `ALTER TABLE "inspections"
       ADD CONSTRAINT "fk_inspections_product_category"
       FOREIGN KEY ("product_category_id")
       REFERENCES "product_categories"("id")
       ON DELETE SET NULL
       ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `CREATE INDEX "ix_inspections_product_category"
       ON "inspections" ("product_category_id")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "ix_inspections_product_category"`);
    await queryRunner.query(
      `ALTER TABLE "inspections" DROP CONSTRAINT IF EXISTS "fk_inspections_product_category"`,
    );
    await queryRunner.query(
      `ALTER TABLE "inspections" DROP COLUMN IF EXISTS "product_category_id"`,
    );
    await queryRunner.query(`DROP INDEX IF EXISTS "ix_product_categories_active"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "product_categories"`);
  }
}
