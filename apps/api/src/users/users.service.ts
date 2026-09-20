import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as bcrypt from 'bcrypt';
import { UserEntity } from '../database/entities/user.entity';
import {
  CreateUserDto,
  ResetPasswordDto,
  UpdateUserDto,
} from './dto/users.dto';

/**
 * Read-shape returned by `list()` / `getById()` — never includes the
 * bcrypt hash so an accidental logging of the response can't leak
 * credentials.
 */
export interface UserView {
  id: string;
  email: string;
  fullName: string;
  role: UserEntity['role'];
  isActive: boolean;
  isSuperAdmin: boolean;
  mfaEnabled: boolean;
  uiLayout: UserEntity['uiLayout'];
  lastLoginAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

function toView(u: UserEntity): UserView {
  return {
    id: u.id,
    email: u.email,
    fullName: u.fullName,
    role: u.role,
    isActive: u.isActive,
    isSuperAdmin: !!u.isSuperAdmin,
    mfaEnabled: u.mfaEnabled,
    uiLayout: u.uiLayout,
    lastLoginAt: u.lastLoginAt ?? null,
    createdAt: u.createdAt,
    updatedAt: u.updatedAt,
  };
}

interface Caller {
  userId: string;
  isSuperAdmin: boolean;
}

/**
 * Guards every mutating path with the three rules the Users master
 * needs:
 *
 *  1. Only super-admin callers can call `create`, `update`, `remove`,
 *     `setActive`, `resetPassword`, `bulkImport`. The controller
 *     decorator on each method is `@Roles('super_admin')` — but
 *     because `super_admin` isn't part of the `UserRole` enum, we
 *     layer a hard-coded check here too. See `assertSuperAdmin`.
 *
 *  2. A super-admin cannot edit / disable / re-role / re-flag their
 *     own row. They can still call `getById` and `list` on it.
 *
 *  3. The bootstrap super-admin (the seeded `admin@qc.local` row,
 *     identified by `isSuperAdmin === true`) cannot be edited,
 *     disabled, deleted, demoted, or have its password reset by ANY
 *     caller — even a future super-admin. To change that row's
 *     password you must do it directly against the database. This is
 *     the "no one can edit the super-admin" rule.
 *
 * The non-mutating `list` / `getById` are open to any logged-in user
 * so the inspections-grid "Submitted by" dropdown still works.
 */
@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(UserEntity)
    private readonly users: Repository<UserEntity>,
  ) {}

  async list(caller: Caller): Promise<UserView[]> {
    void caller; // read-only — everyone sees everyone, but no hashes
    const rows = await this.users.find({ order: { fullName: 'ASC' } });
    return rows.map(toView);
  }

  async getById(id: string): Promise<UserView> {
    const u = await this.users.findOne({ where: { id } });
    if (!u) throw new NotFoundException('User not found');
    return toView(u);
  }

  async create(dto: CreateUserDto, caller: Caller): Promise<UserView> {
    this.assertSuperAdmin(caller);
    const existing = await this.users.findOne({ where: { email: dto.email } });
    if (existing) throw new ConflictException('Email already in use');

    const passwordHash = await bcrypt.hash(dto.password, 12);
    const row = this.users.create({
      email: dto.email,
      passwordHash,
      fullName: dto.fullName,
      role: dto.role ?? 'inspector',
      isActive: dto.isActive ?? true,
      // Force FALSE unless the caller is a super-admin AND explicitly
      // asked for it AND is creating a row for someone else (we still
      // refuse to mint a second super-admin through this path so the
      // bootstrap owner stays unique by default). Future super-admins
      // must be promoted by direct DB write.
      isSuperAdmin: false,
    });
    const saved = await this.users.save(row);
    return toView(saved);
  }

  async update(
    id: string,
    dto: UpdateUserDto,
    caller: Caller,
  ): Promise<UserView> {
    this.assertSuperAdmin(caller);
    const target = await this.users.findOne({ where: { id } });
    if (!target) throw new NotFoundException('User not found');
    this.assertNotProtected(target, caller, 'edit');

    const patch: Partial<UserEntity> = {};
    if (dto.fullName !== undefined) patch.fullName = dto.fullName.trim();
    if (dto.email !== undefined && dto.email !== target.email) {
      const clash = await this.users.findOne({ where: { email: dto.email } });
      if (clash) throw new ConflictException('Email already in use');
      patch.email = dto.email.trim();
    }
    if (dto.role !== undefined) patch.role = dto.role;
    if (dto.isActive !== undefined) patch.isActive = dto.isActive;
    if (dto.uiLayout !== undefined) patch.uiLayout = dto.uiLayout;
    // isSuperAdmin is intentionally ignored on this path. Super-admin
    // promotion is a bootstrap / DB-level operation, not something an
    // admin can toggle from the UI. Keeping it out of `UpdateUserDto`
    // would have hidden the rule from the code review; dropping it
    // here with a comment makes the intent visible.
    if (Object.keys(patch).length === 0) return toView(target);
    await this.users.update(id, patch);
    const fresh = await this.users.findOne({ where: { id } });
    return toView(fresh!);
  }

  /**
   * Soft-delete: flip `is_active` to false so past inspections still
   * resolve to a valid user. Hard-deleting would leave dangling FKs
   * on `inspections.inspector_id` and orphan the audit trail.
   */
  async remove(id: string, caller: Caller): Promise<void> {
    this.assertSuperAdmin(caller);
    const target = await this.users.findOne({ where: { id } });
    if (!target) throw new NotFoundException('User not found');
    this.assertNotProtected(target, caller, 'delete');
    await this.users.update(id, { isActive: false });
  }

  async resetPassword(
    id: string,
    dto: ResetPasswordDto,
    caller: Caller,
  ): Promise<void> {
    this.assertSuperAdmin(caller);
    const target = await this.users.findOne({ where: { id } });
    if (!target) throw new NotFoundException('User not found');
    this.assertNotProtected(target, caller, 'reset password');
    const passwordHash = await bcrypt.hash(dto.newPassword, 12);
    await this.users.update(id, { passwordHash });
  }

  /**
   * Hard-delete is intentionally NOT exposed. The frontend "Delete"
   * button maps to `remove()` (soft-delete via `is_active=false`).
   * Keeping this note here so a future PR doesn't accidentally add
   * a `delete()` method that bypasses the audit trail.
   */
  /* eslint-disable @typescript-eslint/no-unused-vars */
  private _hardDeleteNotSupported(_id: string, _caller: Caller): never {
    throw new BadRequestException(
      'Hard delete is not supported. Use the deactivate action instead.',
    );
  }
  /* eslint-enable @typescript-eslint/no-unused-vars */

  // ─── guards ───────────────────────────────────────────────────────

  private assertSuperAdmin(caller: Caller): void {
    if (!caller.isSuperAdmin) {
      throw new ForbiddenException(
        'Only super-admin accounts can manage Users.',
      );
    }
  }

  /**
   * The two protected-row rules:
   *   (a) A super-admin cannot edit their own row (rule 2).
   *   (b) Any caller — including another super-admin — cannot edit
   *       the bootstrap super-admin row, ever (rule 3).
   *
   * `verb` is used in the error message so the UI can surface
   * "you cannot delete yourself" vs. "the super-admin cannot be
   * deleted". For rule 2 the verb is always the action name
   * ("edit", "delete", "reset password").
   */
  private assertNotProtected(
    target: UserEntity,
    caller: Caller,
    verb: string,
  ): void {
    if (target.isSuperAdmin) {
      // Rule 3: bootstrap super-admin is immutable from the API.
      // The phrasing varies per verb so each message reads as
      // natural English instead of "cannot be have its password reset".
      const message =
        verb === 'reset password'
          ? 'The super-admin account cannot have its password reset. ' +
            'This row is the bootstrap owner and must be managed at the database level.'
          : `The super-admin account cannot be ${verb}d. ` +
            'This row is the bootstrap owner and must be managed at the database level.';
      throw new ForbiddenException(message);
    }
    // Rule 2: a non-bootstrap super-admin can't mutate their own row.
    if (caller.isSuperAdmin && target.id === caller.userId) {
      throw new ForbiddenException(
        `You cannot ${verb} your own user record. Ask another super-admin to do it.`,
      );
    }
  }
}
