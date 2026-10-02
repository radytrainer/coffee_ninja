import type { Prisma } from '@prisma/client';
import type { InventoryItemDTO } from '@gcs/types';
import type { z } from 'zod';
import { prisma } from '../config/prisma';
import { badRequest, notFound } from '../utils/errors';
import { decimalToNumber } from '../utils/money';
import type {
  inventoryCreateSchema,
  inventoryUpdateSchema,
  kioskCreateSchema,
  kioskUpdateSchema,
} from '../validators/admin';
import { serializeKiosk } from './settings.service';

// =============================================================
// Inventory
// =============================================================

const inventoryInclude = {
  product: { select: { id: true, name: true } },
} satisfies Prisma.InventoryItemInclude;

function serializeInventory(
  item: Prisma.InventoryItemGetPayload<{ include: typeof inventoryInclude }>,
): InventoryItemDTO {
  const quantity = decimalToNumber(item.quantity);
  const lowStockThreshold = decimalToNumber(item.lowStockThreshold);
  return {
    id: item.id,
    name: item.name,
    unit: item.unit,
    quantity,
    lowStockThreshold,
    lowStock: quantity <= lowStockThreshold,
    productId: item.productId,
    product: item.product,
    createdAt: item.createdAt.toISOString(),
    updatedAt: item.updatedAt.toISOString(),
  };
}

async function assertProduct(productId: string | null | undefined) {
  if (!productId) return;
  if (!(await prisma.product.count({ where: { id: productId } }))) {
    throw badRequest('Linked product does not exist', [
      { path: 'productId', message: 'Unknown product' },
    ]);
  }
}

export async function listInventory() {
  const items = await prisma.inventoryItem.findMany({
    include: inventoryInclude,
    orderBy: { name: 'asc' },
  });
  return items.map(serializeInventory);
}

export async function createInventory(input: z.infer<typeof inventoryCreateSchema>) {
  await assertProduct(input.productId);
  return serializeInventory(
    await prisma.inventoryItem.create({ data: input, include: inventoryInclude }),
  );
}

export async function updateInventory(id: string, input: z.infer<typeof inventoryUpdateSchema>) {
  if (!(await prisma.inventoryItem.count({ where: { id } }))) throw notFound('Inventory item');
  await assertProduct(input.productId);
  return serializeInventory(
    await prisma.inventoryItem.update({ where: { id }, data: input, include: inventoryInclude }),
  );
}

/** Atomic relative adjustment; never lets stock go below zero. */
export async function adjustInventory(id: string, delta: number) {
  const item = await prisma.inventoryItem.findUnique({ where: { id } });
  if (!item) throw notFound('Inventory item');
  const updated = await prisma.inventoryItem.updateMany({
    where: { id, quantity: { gte: delta < 0 ? -delta : 0 } },
    data: { quantity: { increment: delta } },
  });
  if (updated.count === 0) throw badRequest('Not enough stock for this adjustment');
  return serializeInventory(
    await prisma.inventoryItem.findUniqueOrThrow({ where: { id }, include: inventoryInclude }),
  );
}

export async function deleteInventory(id: string) {
  if (!(await prisma.inventoryItem.count({ where: { id } }))) throw notFound('Inventory item');
  await prisma.inventoryItem.delete({ where: { id } });
}

// =============================================================
// Kiosks
// =============================================================

export async function listKiosks() {
  const kiosks = await prisma.kiosk.findMany({ orderBy: { code: 'asc' } });
  return kiosks.map(serializeKiosk);
}

export async function createKiosk(input: z.infer<typeof kioskCreateSchema>) {
  return serializeKiosk(await prisma.kiosk.create({ data: input }));
}

export async function updateKiosk(id: string, input: z.infer<typeof kioskUpdateSchema>) {
  if (!(await prisma.kiosk.count({ where: { id } }))) throw notFound('Kiosk');
  return serializeKiosk(await prisma.kiosk.update({ where: { id }, data: input }));
}

export async function deleteKiosk(id: string) {
  if (!(await prisma.kiosk.count({ where: { id } }))) throw notFound('Kiosk');
  // Orders keep their history; kioskId becomes null.
  await prisma.kiosk.delete({ where: { id } });
}
