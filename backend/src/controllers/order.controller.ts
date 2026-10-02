import type { Request, Response } from 'express';
import * as orders from '../services/order.service';
import * as payments from '../services/payment.service';
import { getKioskConfig } from '../services/settings.service';
import { unauthorized } from '../utils/errors';
import { ok, validate } from '../utils/http';
import { idParams } from '../validators/common';
import {
  createOrderSchema,
  listOrdersQuerySchema,
  quoteOrderSchema,
  updateStatusSchema,
} from '../validators/orders';
import { z } from 'zod';

export async function quote(req: Request, res: Response) {
  ok(res, await orders.quoteOrder(validate(quoteOrderSchema, req.body)));
}

export async function create(req: Request, res: Response) {
  ok(res, await orders.createOrder(validate(createOrderSchema, req.body)), 201);
}

export async function list(req: Request, res: Response) {
  ok(res, await orders.listOrders(validate(listOrdersQuerySchema, req.query)));
}

/** Staff see the full audit trail; customers (kiosk) get the order without staff details. */
export async function getOne(req: Request, res: Response) {
  const { id } = validate(idParams, req.params);
  ok(res, await orders.getOrder(id, { includeHistory: Boolean(req.user) }));
}

export async function publicStatus(req: Request, res: Response) {
  const { id } = validate(idParams, req.params);
  ok(res, await orders.getPublicStatus(id));
}

/** QR payment for the kiosk's payment screen (the order id is unguessable, like /status). */
export async function payment(req: Request, res: Response) {
  const { id } = validate(idParams, req.params);
  ok(res, await payments.getPaymentForOrder(id));
}

/** Customer chose to pay cash at the counter. */
export async function payCash(req: Request, res: Response) {
  const { id } = validate(idParams, req.params);
  ok(res, await payments.chooseCash(id));
}

/** Customer backs out on the payment screen: cancels the unpaid order. */
export async function cancelUnpaid(req: Request, res: Response) {
  const { id } = validate(idParams, req.params);
  await payments.cancelUnpaid(id);
  ok(res, await orders.getPublicStatus(id));
}

export async function updateStatus(req: Request, res: Response) {
  if (!req.user) throw unauthorized();
  const { id } = validate(idParams, req.params);
  const { status, note } = validate(updateStatusSchema, req.body);
  ok(res, await orders.updateOrderStatus(id, status, req.user.id, note));
}

const kioskQuery = z.object({ code: z.string().trim().max(40).optional() });

export async function kioskConfig(req: Request, res: Response) {
  const { code } = validate(kioskQuery, req.query);
  ok(res, await getKioskConfig(code));
}
