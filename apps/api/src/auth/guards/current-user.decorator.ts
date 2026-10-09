import { createParamDecorator, ExecutionContext } from '@nestjs/common';

export interface AuthUser {
  userId: string;
  email: string;
  role: 'admin' | 'inspector' | 'viewer';
  mfaVerified: boolean;
  /**
   * Current `users.is_super_admin` value loaded by JwtStrategy. Lets request
   * handlers decide "is this caller the bootstrap owner?" without another
   * query in each handler.
   */
  isSuperAdmin: boolean;
}

export const CurrentUser = createParamDecorator(
  (_: unknown, ctx: ExecutionContext): AuthUser => {
    const req = ctx.switchToHttp().getRequest();
    return req.user;
  },
);
