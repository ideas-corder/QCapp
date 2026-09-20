import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

export type UserRole = 'admin' | 'inspector' | 'viewer';

/**
 * UI layout the user prefers on the New Inspection form.
 *  - 'modern'  : wide layout with sticky neutral sidebar nav + always-expanded
 *                step cards + floating submit bar (default).
 *  - 'classic' : wide layout with a green sticky progress sidebar + collapsible
 *                step cards + floating green submit bar.
 *
 * Stored on the user so the choice survives across sessions and devices.
 * A `qc_ui_layout` cookie is also set on the web side so SSR can pick the
 * layout without an extra round-trip.
 */
export type UiLayout = 'modern' | 'classic';

@Entity({ name: 'users' })
@Index('uq_users_email', ['email'], { unique: true })
export class UserEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'varchar', length: 255 })
  email!: string;

  @Column({ type: 'varchar', length: 255, name: 'password_hash' })
  passwordHash!: string;

  @Column({ type: 'varchar', length: 255, name: 'full_name' })
  fullName!: string;

  @Column({ type: 'varchar', length: 32, default: 'inspector' })
  role!: UserRole;

  @Column({ type: 'boolean', default: true, name: 'is_active' })
  isActive!: boolean;

  @Column({ type: 'varchar', length: 64, nullable: true, name: 'mfa_secret' })
  mfaSecret!: string | null;

  @Column({ type: 'boolean', default: false, name: 'mfa_enabled' })
  mfaEnabled!: boolean;

  @Column({ type: 'timestamp', nullable: true, name: 'last_login_at' })
  lastLoginAt!: Date | null;

  @Column({ type: 'varchar', length: 16, default: 'modern', name: 'ui_layout' })
  uiLayout!: UiLayout;

  /**
   * Marks the bootstrap-owner account. The seeded `admin@qc.local`
   * row is promoted to TRUE by migration 1700000027000. Only super-
   * admins can manage the Users master, and even a super-admin
   * cannot edit / disable / delete their own row — the guard in
   * UsersService enforces that. Kept separate from `role` so the
   * existing RolesGuard and the existing `admin` dashboard access
   * paths keep working unchanged.
   */
  @Column({ type: 'boolean', default: false, name: 'is_super_admin' })
  isSuperAdmin!: boolean;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt!: Date;
}
