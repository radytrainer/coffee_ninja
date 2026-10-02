import type { CookieOptions, Request, Response } from 'express';
import { z } from 'zod';
import { env } from '../config/env';
import * as auth from '../services/auth.service';
import { unauthorized } from '../utils/errors';
import { ok, validate } from '../utils/http';
import { AUTH_COOKIE } from '../utils/jwt';

const loginSchema = z.object({
  email: z.string().trim().toLowerCase().pipe(z.email('Enter a valid email address')),
  password: z.string().min(1, 'Password is required').max(200),
});

function cookieOptions(): CookieOptions {
  return {
    httpOnly: true,
    secure: env.COOKIE_SECURE,
    sameSite: 'lax',
    path: '/',
  };
}

export async function login(req: Request, res: Response) {
  const { email, password } = validate(loginSchema, req.body);
  const result = await auth.login(email, password);
  res.cookie(AUTH_COOKIE, result.token, {
    ...cookieOptions(),
    maxAge: auth.expiresInToMs(result.expiresIn),
  });
  ok(res, result);
}

export async function logout(req: Request, res: Response) {
  if (req.user) await auth.revokeSessions(req.user.id);
  res.clearCookie(AUTH_COOKIE, cookieOptions());
  ok(res, { loggedOut: true });
}

export async function me(req: Request, res: Response) {
  if (!req.user) throw unauthorized();
  ok(res, await auth.getUser(req.user.id));
}
