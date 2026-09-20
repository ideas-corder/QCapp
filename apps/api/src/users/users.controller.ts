import {
  Body,
  Controller,
  DefaultValuePipe,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseBoolPipe,
  ParseUUIDPipe,
  Post,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  CurrentUser,
  JwtAuthGuard,
  Roles,
  RolesGuard,
} from '../auth/guards/roles.guard';
import { AuthUser } from '../auth/guards/current-user.decorator';
import { SuperAdminGuard } from '../auth/guards/super-admin.guard';
import {
  CreateUserDto,
  ResetPasswordDto,
  UpdateUserDto,
} from './dto/users.dto';
import { UserView, UsersService } from './users.service';

/**
 * Two surfaces share this controller:
 *
 *  1. Read-only "submitted by" lookup (`GET /users?includeInactive=…`)
 *     used by the Inspections grid filter bar. Returns the minimum
 *     fields and is open to any logged-in user.
 *
 *  2. The Users master CRUD (`POST`, `PUT`, `DELETE`, reset-password).
 *     Gated by `RolesGuard('admin')` + `SuperAdminGuard` so only the
 *     bootstrap owner (and any future promoted super-admins) can
 *     create / edit / disable accounts. The service then layers the
 *     self-edit and bootstrap-immutability rules.
 *
 * Soft-delete only: `DELETE /users/:id` flips `is_active` to false.
 * Past inspections still resolve to the user row so the audit trail
 * stays intact.
 */
@Controller('users')
@UseGuards(JwtAuthGuard, RolesGuard)
export class UsersController {
  constructor(private readonly service: UsersService) {}

  // ─── read-only lookup (Inspections filter bar) ─────────────────────

  @Get()
  @Roles('admin', 'inspector', 'viewer')
  async list(
    @CurrentUser() user: AuthUser,
    @Query('includeInactive', new DefaultValuePipe(false), ParseBoolPipe)
    includeInactive: boolean,
  ): Promise<
    { id: string; fullName: string; email: string; role: string }[]
  > {
    const caller = { userId: user.userId, isSuperAdmin: user.isSuperAdmin };
    const rows = await this.service.list(caller);
    // Filter here (rather than in the service) so the existing
    // dropdown contract is preserved: it only needs id / name /
    // email / role, and the dropdown itself filters inactive rows
    // out unless the caller explicitly opts in.
    return rows
      .filter((u) => includeInactive || u.isActive)
      .map((u) => ({
        id: u.id,
        fullName: u.fullName,
        email: u.email,
        role: u.role,
      }));
  }

  // ─── Users master CRUD ─────────────────────────────────────────────

  @Get('all')
  @UseGuards(SuperAdminGuard)
  @Roles('admin')
  async listAll(): Promise<UserView[]> {
    // Caller check is inside the service — listAll is open to admins
    // for read purposes; only the mutating endpoints need super-admin.
    // (We still surface isSuperAdmin to the UI so the self-edit
    // affordance can be hidden.)
    // The service's `list()` reads everyone; pass a sentinel super-admin
    // caller because the read path doesn't care about the flag.
    return this.service.list({ userId: '', isSuperAdmin: true });
  }

  @Post()
  @UseGuards(SuperAdminGuard)
  @Roles('admin')
  @HttpCode(201)
  create(
    @CurrentUser() user: AuthUser,
    @Body() dto: CreateUserDto,
  ): Promise<UserView> {
    return this.service.create(dto, {
      userId: user.userId,
      isSuperAdmin: user.isSuperAdmin,
    });
  }

  @Put(':id')
  @UseGuards(SuperAdminGuard)
  @Roles('admin')
  update(
    @CurrentUser() user: AuthUser,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: UpdateUserDto,
  ): Promise<UserView> {
    return this.service.update(
      id,
      dto,
      { userId: user.userId, isSuperAdmin: user.isSuperAdmin },
    );
  }

  @Delete(':id')
  @UseGuards(SuperAdminGuard)
  @Roles('admin')
  @HttpCode(204)
  async remove(
    @CurrentUser() user: AuthUser,
    @Param('id', new ParseUUIDPipe()) id: string,
  ): Promise<void> {
    await this.service.remove(id, {
      userId: user.userId,
      isSuperAdmin: user.isSuperAdmin,
    });
  }

  @Post(':id/reset-password')
  @UseGuards(SuperAdminGuard)
  @Roles('admin')
  @HttpCode(204)
  async resetPassword(
    @CurrentUser() user: AuthUser,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: ResetPasswordDto,
  ): Promise<void> {
    await this.service.resetPassword(
      id,
      dto,
      { userId: user.userId, isSuperAdmin: user.isSuperAdmin },
    );
  }
}
