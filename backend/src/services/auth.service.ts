import bcrypt from 'bcryptjs';
import { env } from '../config/env';
import { prisma } from '../config/prisma';
import { unauthorized } from '../utils/errors';
import { signToken } from '../utils/jwt';
import { serializeUser, userSelect } from '../utils/serializers';

// Used to keep response timing similar whether or not the email exists.
const DUMMY_HASH = bcrypt.hashSync('dummy-password-for-timing', 10);

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, env.BCRYPT_ROUNDS);
}

export async function login(email: string, password: string) {
  const user = await prisma.user.findUnique({ where: { email: email.toLowerCase() } });
  const valid = await bcrypt.compare(password, user?.passwordHash ?? DUMMY_HASH);
  if (!user || !valid || !user.active) {
    // Same message for every failure so attackers cannot enumerate accounts.
    throw unauthorized('Invalid email or password');
  }
  const updated = await prisma.user.update({
    where: { id: user.id },
    data: { lastLoginAt: new Date() },
    select: userSelect,
  });
  const token = signToken({ sub: user.id, role: user.role, ver: user.sessionVersion });
  return { user: serializeUser(updated), token, expiresIn: env.JWT_EXPIRES_IN };
}

/** Revokes every token issued to this user (used by logout). */
export async function revokeSessions(userId: string): Promise<void> {
  await prisma.user.update({ where: { id: userId }, data: { sessionVersion: { increment: 1 } } });
}

export async function getUser(id: string) {
  const user = await prisma.user.findUnique({ where: { id }, select: userSelect });
  if (!user || !user.active) throw unauthorized();
  return serializeUser(user);
}

/** Converts "8h" / "30m" / "7d" / "3600" (seconds) to milliseconds for the cookie maxAge. */
export function expiresInToMs(value: string): number {
  const match = /^(\d+)\s*([smhd]?)$/.exec(value.trim());
  if (!match) return 8 * 60 * 60 * 1000;
  const amount = Number(match[1]);
  const unit = match[2] || 's';
  const factor = { s: 1000, m: 60_000, h: 3_600_000, d: 86_400_000 }[unit as 's' | 'm' | 'h' | 'd'];
  return amount * factor;
}
