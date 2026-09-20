import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Lets the user pick between two New Inspection form layouts:
 *
 *   ui_layout = 'modern'  (default) — wide layout, sticky neutral sidebar
 *                                with always-expanded step cards and a
 *                                floating submit bar at the bottom.
 *   ui_layout = 'classic'           — wide layout, green sticky progress
 *                                sidebar with collapsible step cards and a
 *                                floating green submit bar.
 *
 * The web app also writes a `qc_ui_layout` cookie so SSR can pick the
 * layout without an extra round-trip to the DB. The DB column is the
 * source of truth across devices.
 */
export class AddUserUiLayout1700000017000 implements MigrationInterface {
  name = 'AddUserUiLayout1700000017000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "users" ADD COLUMN "ui_layout" varchar(16) NOT NULL DEFAULT 'modern'`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "users" DROP COLUMN "ui_layout"`);
  }
}
