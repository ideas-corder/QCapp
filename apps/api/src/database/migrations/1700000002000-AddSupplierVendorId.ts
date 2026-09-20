import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddSupplierVendorId1700000002000 implements MigrationInterface {
  name = 'AddSupplierVendorId1700000002000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Nullable + unique-when-not-null so existing rows aren't blocked.
    // After backfilling real D365 vendor IDs, flip to NOT NULL in a follow-up.
    await queryRunner.query(
      `ALTER TABLE "suppliers" ADD COLUMN "vendor_id" varchar(32)`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "uq_suppliers_vendor_id" ON "suppliers" ("vendor_id") WHERE "vendor_id" IS NOT NULL`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "uq_suppliers_vendor_id"`);
    await queryRunner.query(`ALTER TABLE "suppliers" DROP COLUMN IF EXISTS "vendor_id"`);
  }
}
