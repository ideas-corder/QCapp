import { createParamDecorator, ExecutionContext } from '@nestjs/common';

export interface AuthUser {
  userId: string;
  email: string;
  role: 'admin' | 'inspector' | 'viewer';
  mfaVerified: boolean;
  /**
   * Mirrors `users.is_super_admin`. Lets request handlers decide
   * "is this caller the bootstrap owner?" without re-querying the
   * user row. Carried on every authenticated request because the
   * JWT lifetime is short and the flag rarely changes.
   */
  isSuperAdmin: boolean;
}

export const CurrentUser = createParamDecorator(
  (_: unknown, ctx: ExecutionContext): AuthUser => {
    const req = ctx.switchToHttp().getRequest();
    return req.user;
  },
);
