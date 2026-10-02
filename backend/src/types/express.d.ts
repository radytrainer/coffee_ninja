import type { UserRole } from '@gcs/types';

export interface AuthUser {
  id: string;
  email: string;
  name: string;
  role: UserRole;
}

declare module 'express-serve-static-core' {
  interface Request {
    /** Set by the auth middleware for authenticated staff/admin requests. */
    user?: AuthUser;
  }
}
