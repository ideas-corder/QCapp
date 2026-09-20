import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthUser } from './current-user.decorator';

/**
 * Marker decorator for endpoints that require a super-admin caller.
 * Used on the Users master CRUD (`POST /users`, `PUT /users/:id`,
 * etc.) so we can guard them without polluting `UserRole` with a
 * 'super_admin' value (which would leak into JWTs, role-based UI
 * rendering, and the existing `RolesGuard`).
 *
 * Note: this guard is layered ON TOP of `RolesGuard`, which still
 * enforces the coarse `admin` / `inspector` / `viewer` role check.
 * Together they say "must be logged in + must have role 'admin' +
 * must have isSuperAdmin=true".
 */
export const SUPER_ADMIN_KEY = 'isSuperAdmin';
export const SuperAdminOnly = () =>
  // We're not actually using reflector for this guard — it just reads
  // the request user. The decorator exists for readability and for
  // future code-search ("which endpoints require super-admin?").
  () => undefined;

@Injectable()
export class SuperAdminGuard implements CanActivate {
  // Reflector is injected to satisfy Nest's DI graph even though the
  // marker decorator above doesn't carry metadata. If you want to
  // switch to metadata-driven checks later, this is the hook.
  constructor(_reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest();
    const user = req.user as AuthUser | undefined;
    if (!user) {
      throw new ForbiddenException('Not authenticated');
    }
    if (!user.isSuperAdmin) {
      throw new ForbiddenException(
        'Super-admin privileges required for this action.',
      );
    }
    return true;
  }
}
