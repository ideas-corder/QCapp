// Shared authentication identity and authorization types. Middleware gets
// this identity from the API's verified /auth/me response; application code
// never decodes the access token for rendering or route authorization.

export type UserRole = 'admin' | 'inspector' | 'viewer';

export interface CallerIdentity {
  userId: string;
  email: string;
  role: UserRole;
  isSuperAdmin: boolean;
}
