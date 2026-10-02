import jwt, { type SignOptions } from 'jsonwebtoken';
import type { UserRole } from '@gcs/types';
import { env } from '../config/env';

export const AUTH_COOKIE = 'gcs_session';

export interface TokenPayload {
  sub: string;
  role: UserRole;
  /** Must match User.sessionVersion; bumping it revokes all issued tokens. */
  ver: number;
}

export function signToken(payload: TokenPayload): string {
  return jwt.sign(payload, env.JWT_SECRET, {
    expiresIn: env.JWT_EXPIRES_IN as SignOptions['expiresIn'],
    algorithm: 'HS256',
    issuer: 'gesture-coffee-shop',
  });
}

/** Returns the payload, or null if the token is missing/invalid/expired. */
export function verifyToken(token: string | undefined | null): TokenPayload | null {
  if (!token) return null;
  try {
    const decoded = jwt.verify(token, env.JWT_SECRET, {
      algorithms: ['HS256'],
      issuer: 'gesture-coffee-shop',
    });
    if (typeof decoded !== 'object' || typeof decoded.sub !== 'string') return null;
    const { role, ver } = decoded as { role?: unknown; ver?: unknown };
    if (role !== 'ADMIN' && role !== 'STAFF') return null;
    if (typeof ver !== 'number') return null;
    return { sub: decoded.sub, role, ver };
  } catch {
    return null;
  }
}

/** Minimal cookie header parser for the Socket.IO handshake. */
export function readCookie(header: string | undefined, name: string): string | undefined {
  if (!header) return undefined;
  for (const part of header.split(';')) {
    const [key, ...rest] = part.trim().split('=');
    if (key === name) return decodeURIComponent(rest.join('='));
  }
  return undefined;
}
