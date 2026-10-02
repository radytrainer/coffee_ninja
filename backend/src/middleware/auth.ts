import type { NextFunction, Request, RequestHandler, Response } from 'express';
import type { UserRole } from '@gcs/types';
import { prisma } from '../config/prisma';
import { forbidden, unauthorized } from '../utils/errors';
import { AUTH_COOKIE, verifyToken } from '../utils/jwt';

function extractToken(req: Request): string | undefined {
  const header = req.headers.authorization;
  if (header?.startsWith('Bearer ')) return header.slice('Bearer '.length).trim();
  const cookie = (req.cookies as Record<string, string> | undefined)?.[AUTH_COOKIE];
  return cookie || undefined;
}

/** Resolves the current user from the session cookie or Bearer token (if any). */
async function resolveUser(req: Request): Promise<void> {
  if (req.user) return;
  const payload = verifyToken(extractToken(req));
  if (!payload) return;
  // Re-check the database so deactivated users / changed roles take effect immediately.
  const user = await prisma.user.findUnique({
    where: { id: payload.sub },
    select: { id: true, email: true, name: true, role: true, active: true, sessionVersion: true },
  });
  if (!user || !user.active || user.sessionVersion !== payload.ver) return;
  req.user = { id: user.id, email: user.email, name: user.name, role: user.role };
}

/** Attaches req.user when a valid session exists, but never rejects. */
export const optionalAuth: RequestHandler = async (req, _res, next) => {
  await resolveUser(req);
  next();
};

/** Requires an authenticated user with one of the given roles (any role if none given). */
export function requireAuth(...roles: UserRole[]): RequestHandler {
  return async (req: Request, _res: Response, next: NextFunction) => {
    await resolveUser(req);
    if (!req.user) throw unauthorized();
    if (roles.length > 0 && !roles.includes(req.user.role)) throw forbidden();
    next();
  };
}

export const requireStaff = requireAuth('STAFF', 'ADMIN');
export const requireAdmin = requireAuth('ADMIN');
