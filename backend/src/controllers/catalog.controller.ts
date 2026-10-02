import type { Request, Response } from 'express';
import * as catalog from '../services/catalog.service';
import { ok, validate } from '../utils/http';
import { idParams } from '../validators/common';
import {
  categoryCreateSchema,
  categoryQuerySchema,
  categoryUpdateSchema,
  optionCreateSchema,
  optionGroupCreateSchema,
  optionGroupUpdateSchema,
  optionUpdateSchema,
  productCreateSchema,
  productQuerySchema,
  productUpdateSchema,
} from '../validators/catalog';

/** Admins may request hidden (inactive) records with ?all=true. */
const canSeeHidden = (req: Request, requested: boolean | undefined) =>
  requested === true && req.user?.role === 'ADMIN';

// ---------- categories ----------
export async function listCategories(req: Request, res: Response) {
  const query = validate(categoryQuerySchema, req.query);
  ok(res, await catalog.listCategories(canSeeHidden(req, query.all)));
}
export async function getCategory(req: Request, res: Response) {
  const { id } = validate(idParams, req.params);
  ok(res, await catalog.getCategory(id, req.user?.role === 'ADMIN'));
}
export async function createCategory(req: Request, res: Response) {
  ok(res, await catalog.createCategory(validate(categoryCreateSchema, req.body)), 201);
}
export async function updateCategory(req: Request, res: Response) {
  const { id } = validate(idParams, req.params);
  ok(res, await catalog.updateCategory(id, validate(categoryUpdateSchema, req.body)));
}
export async function deleteCategory(req: Request, res: Response) {
  const { id } = validate(idParams, req.params);
  await catalog.deleteCategory(id);
  ok(res, { id, deleted: true });
}

// ---------- products ----------
export async function listProducts(req: Request, res: Response) {
  const query = validate(productQuerySchema, req.query);
  ok(res, await catalog.listProducts(query, canSeeHidden(req, query.all)));
}
export async function getProduct(req: Request, res: Response) {
  const { id } = validate(idParams, req.params);
  ok(res, await catalog.getProduct(id, req.user?.role === 'ADMIN'));
}
export async function createProduct(req: Request, res: Response) {
  ok(res, await catalog.createProduct(validate(productCreateSchema, req.body)), 201);
}
export async function updateProduct(req: Request, res: Response) {
  const { id } = validate(idParams, req.params);
  ok(res, await catalog.updateProduct(id, validate(productUpdateSchema, req.body)));
}
export async function deleteProduct(req: Request, res: Response) {
  const { id } = validate(idParams, req.params);
  await catalog.deleteProduct(id);
  ok(res, { id, deleted: true });
}

// ---------- option groups ----------
export async function listOptionGroups(_req: Request, res: Response) {
  ok(res, await catalog.listOptionGroups());
}
export async function getOptionGroup(req: Request, res: Response) {
  const { id } = validate(idParams, req.params);
  ok(res, await catalog.getOptionGroup(id));
}
export async function createOptionGroup(req: Request, res: Response) {
  ok(res, await catalog.createOptionGroup(validate(optionGroupCreateSchema, req.body)), 201);
}
export async function updateOptionGroup(req: Request, res: Response) {
  const { id } = validate(idParams, req.params);
  ok(res, await catalog.updateOptionGroup(id, validate(optionGroupUpdateSchema, req.body)));
}
export async function deleteOptionGroup(req: Request, res: Response) {
  const { id } = validate(idParams, req.params);
  await catalog.deleteOptionGroup(id);
  ok(res, { id, deleted: true });
}

// ---------- options ----------
export async function createOption(req: Request, res: Response) {
  const { id } = validate(idParams, req.params);
  ok(res, await catalog.createOption(id, validate(optionCreateSchema, req.body)), 201);
}
export async function updateOption(req: Request, res: Response) {
  const { id } = validate(idParams, req.params);
  ok(res, await catalog.updateOption(id, validate(optionUpdateSchema, req.body)));
}
export async function deleteOption(req: Request, res: Response) {
  const { id } = validate(idParams, req.params);
  await catalog.deleteOption(id);
  ok(res, { id, deleted: true });
}
