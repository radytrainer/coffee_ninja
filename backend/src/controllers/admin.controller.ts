import type { Request, Response } from 'express';
import * as admin from '../services/admin.service';
import * as reports from '../services/report.service';
import { getShopSettings, updateShopSettings } from '../services/settings.service';
import { ok, validate } from '../utils/http';
import {
  dateRangeQuery,
  inventoryAdjustSchema,
  inventoryCreateSchema,
  inventoryUpdateSchema,
  kioskCreateSchema,
  kioskUpdateSchema,
  settingsUpdateSchema,
} from '../validators/admin';
import { idParams } from '../validators/common';

// ---------- reports ----------
export async function dashboard(_req: Request, res: Response) {
  ok(res, await reports.dashboard());
}
export async function sales(req: Request, res: Response) {
  const query = validate(dateRangeQuery, req.query);
  ok(res, await reports.salesByDay(await reports.resolveRange(query, 14)));
}
export async function products(req: Request, res: Response) {
  const query = validate(dateRangeQuery, req.query);
  ok(res, await reports.topProducts(await reports.resolveRange(query, 30), query.limit));
}
export async function orders(req: Request, res: Response) {
  const query = validate(dateRangeQuery, req.query);
  ok(res, await reports.ordersReport(await reports.resolveRange(query, 30)));
}

// ---------- inventory ----------
export async function listInventory(_req: Request, res: Response) {
  ok(res, await admin.listInventory());
}
export async function createInventory(req: Request, res: Response) {
  ok(res, await admin.createInventory(validate(inventoryCreateSchema, req.body)), 201);
}
export async function updateInventory(req: Request, res: Response) {
  const { id } = validate(idParams, req.params);
  ok(res, await admin.updateInventory(id, validate(inventoryUpdateSchema, req.body)));
}
export async function adjustInventory(req: Request, res: Response) {
  const { id } = validate(idParams, req.params);
  ok(res, await admin.adjustInventory(id, validate(inventoryAdjustSchema, req.body).delta));
}
export async function deleteInventory(req: Request, res: Response) {
  const { id } = validate(idParams, req.params);
  await admin.deleteInventory(id);
  ok(res, { id, deleted: true });
}

// ---------- kiosks ----------
export async function listKiosks(_req: Request, res: Response) {
  ok(res, await admin.listKiosks());
}
export async function createKiosk(req: Request, res: Response) {
  ok(res, await admin.createKiosk(validate(kioskCreateSchema, req.body)), 201);
}
export async function updateKiosk(req: Request, res: Response) {
  const { id } = validate(idParams, req.params);
  ok(res, await admin.updateKiosk(id, validate(kioskUpdateSchema, req.body)));
}
export async function deleteKiosk(req: Request, res: Response) {
  const { id } = validate(idParams, req.params);
  await admin.deleteKiosk(id);
  ok(res, { id, deleted: true });
}

// ---------- settings ----------
export async function getSettings(_req: Request, res: Response) {
  ok(res, await getShopSettings());
}
export async function updateSettings(req: Request, res: Response) {
  ok(res, await updateShopSettings(validate(settingsUpdateSchema, req.body)));
}
