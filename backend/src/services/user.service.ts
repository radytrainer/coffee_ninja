import type { z } from 'zod';
import { prisma } from '../config/prisma';
import { badRequest, conflict, notFound } from '../utils/errors';
import { serializeUser, userSelect } from '../utils/serializers';
import type { userCreateSchema, userUpdateSchema } from '../validators/users';
import { hashPassword } from './auth.service';

export async function listUsers() {
  const users = await prisma.user.findMany({
    select: userSelect,
    orderBy: [{ role: 'asc' }, { name: 'asc' }],
  });
  return users.map(serializeUser);
}

export async function createUser(input: z.infer<typeof userCreateSchema>) {
  const exists = await prisma.user.count({ where: { email: input.email } });
  if (exists) throw conflict('A user with this email already exists');
  const user = await prisma.user.create({
    data: {
      email: input.email,
      name: input.name,
      role: input.role,
      active: input.active,
      passwordHash: await hashPassword(input.password),
    },
    select: userSelect,
  });
  return serializeUser(user);
}

async function assertNotLastAdmin(userId: string) {
  const target = await prisma.user.findUnique({
    where: { id: userId },
    select: { role: true, active: true },
  });
  if (target?.role !== 'ADMIN' || !target.active) return;
  const admins = await prisma.user.count({ where: { role: 'ADMIN', active: true } });
  if (admins <= 1) throw conflict('At least one active admin account is required');
}

export async function updateUser(
  id: string,
  input: z.infer<typeof userUpdateSchema>,
  actingUserId: string,
) {
  const existing = await prisma.user.findUnique({ where: { id } });
  if (!existing) throw notFound('User');
  if (
    id === actingUserId &&
    (input.active === false || (input.role && input.role !== existing.role))
  ) {
    throw badRequest('You cannot deactivate yourself or change your own role');
  }
  if (input.active === false || (input.role && input.role !== 'ADMIN'))
    await assertNotLastAdmin(id);
  if (input.email && input.email !== existing.email) {
    if (await prisma.user.count({ where: { email: input.email } })) {
      throw conflict('A user with this email already exists');
    }
  }
  const { password, ...rest } = input;
  // Security-relevant changes sign the user out everywhere.
  const revoke =
    Boolean(password) || input.active === false || (input.role && input.role !== existing.role);
  const user = await prisma.user.update({
    where: { id },
    data: {
      ...rest,
      ...(password ? { passwordHash: await hashPassword(password) } : {}),
      ...(revoke ? { sessionVersion: { increment: 1 } } : {}),
    },
    select: userSelect,
  });
  return serializeUser(user);
}

export async function deleteUser(id: string, actingUserId: string) {
  if (id === actingUserId) throw badRequest('You cannot delete your own account');
  if (!(await prisma.user.count({ where: { id } }))) throw notFound('User');
  await assertNotLastAdmin(id);
  // Status history keeps the order audit trail; changedBy becomes null.
  await prisma.user.delete({ where: { id } });
}
