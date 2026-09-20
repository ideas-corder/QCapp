import { Injectable, SetMetadata } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { UserRole } from '../../database/entities/user.entity';

export const ROLES_KEY = 'roles';
export const Roles = (...roles: UserRole[]) => SetMetadata(ROLES_KEY, roles);

@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {}

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<UserRole[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!required || required.length === 0) return true;
    const { user } = context.switchToHttp().getRequest();
    if (!user) throw new ForbiddenException();
    if (!required.includes(user.role)) {
      throw new ForbiddenException(
        `Required role: ${required.join(' or ')} (your role: ${user.role})`,
      );
    }
    return true;
  }
}

export { AuthUser, CurrentUser } from './current-user.decorator';
