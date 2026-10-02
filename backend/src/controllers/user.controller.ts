import type { Request, Response } from 'express';
import * as users from '../services/user.service';
import { unauthorized } from '../utils/errors';
import { ok, validate } from '../utils/http';
import { idParams } from '../validators/common';
import { userCreateSchema, userUpdateSchema } from '../validators/users';

export async function list(_req: Request, res: Response) {
  ok(res, await users.listUsers());
}

export async function create(req: Request, res: Response) {
  ok(res, await users.createUser(validate(userCreateSchema, req.body)), 201);
}

export async function update(req: Request, res: Response) {
  if (!req.user) throw unauthorized();
  const { id } = validate(idParams, req.params);
  ok(res, await users.updateUser(id, validate(userUpdateSchema, req.body), req.user.id));
}

export async function remove(req: Request, res: Response) {
  if (!req.user) throw unauthorized();
  const { id } = validate(idParams, req.params);
  await users.deleteUser(id, req.user.id);
  ok(res, { id, deleted: true });
}
