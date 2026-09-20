import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { UserEntity } from '../database/entities/user.entity';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';
import { SuperAdminGuard } from '../auth/guards/super-admin.guard';

/**
 * The Users master only needs:
 *   - `TypeOrmModule.forFeature([UserEntity])` for repository access
 *   - `SuperAdminGuard` to gate the mutating endpoints
 *
 * We deliberately do NOT import `AuthModule` here — that would create
 * a circular dependency (AuthModule already imports UsersModule to
 * reuse the user repository). The guard is self-contained: it reads
 * `request.user.isSuperAdmin` which the JWT strategy populates, so
 * no service-level dependency on AuthService is required.
 */
@Module({
  imports: [TypeOrmModule.forFeature([UserEntity])],
  controllers: [UsersController],
  providers: [UsersService, SuperAdminGuard],
  exports: [TypeOrmModule, UsersService],
})
export class UsersModule {}
