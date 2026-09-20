import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Adds the `is_super_admin` flag to the `users` table.
 *
 * This is intentionally NOT a new value in the `role` enum:
 *   - Keeping `role` as the coarse "what dashboards / pages can this
 *     user see" axis (admin / inspector / viewer) is simpler to
 *     reason about for the existing `RolesGuard`.
 *   - `is_super_admin` is the narrow, app-level "this account is the
 *     bootstrap owner; no one can edit / disable / delete it, and it
 *     is the only account that can manage the Users master itself"
 *     flag. The guard for the Users CRUD endpoints checks this flag,
 *     not the `role`.
 *
 * Default is `FALSE`. The seeded `admin@qc.local` row is promoted in
 * this same migration so that, on a fresh database, the very first
 * account can immediately access /users. On a database that already
 * has multiple admins, only the seeded `admin@qc.local` is promoted
 * — extra admins can later be promoted by hand if desired.
 */
export class AddUserSuperAdmin1700000027000 implements MigrationInterface {
  name = 'AddUserSuperAdmin1700000027000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "users" ADD COLUMN "is_super_admin" boolean NOT NULL DEFAULT FALSE`,
    );
    // Promote the seeded admin so /users is usable on a fresh install.
    await queryRunner.query(
      `UPDATE "users" SET "is_super_admin" = TRUE WHERE "email" = 'admin@qc.local'`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "users" DROP COLUMN "is_super_admin"`);
  }
}
