import type { Prisma } from '@prisma/client';
import type { KioskConfigDTO, KioskDTO, ShopSettingsDTO } from '@gcs/types';
import { prisma } from '../config/prisma';

type Client = Prisma.TransactionClient | typeof prisma;

export const SETTING_DEFAULTS: ShopSettingsDTO = {
  shopName: 'PNC Coffee',
  currency: 'USD',
  taxRate: 0.1,
  orderNumberPrefix: 'A',
  timezone: 'Asia/Phnom_Penh',
  requirePayment: true,
  allowCashPayment: true,
  smileDiscountRate: 0.05,
};

export async function getShopSettings(client: Client = prisma): Promise<ShopSettingsDTO> {
  const rows = await client.setting.findMany({
    where: { key: { in: Object.keys(SETTING_DEFAULTS) } },
  });
  const values = new Map(rows.map((r) => [r.key, r.value]));
  const str = (key: keyof ShopSettingsDTO) => {
    const v = values.get(key);
    return typeof v === 'string' && v.length > 0 ? v : (SETTING_DEFAULTS[key] as string);
  };
  const rate = values.get('taxRate');
  const requirePayment = values.get('requirePayment');
  const allowCash = values.get('allowCashPayment');
  const smile = values.get('smileDiscountRate');
  return {
    shopName: str('shopName'),
    currency: str('currency'),
    orderNumberPrefix: str('orderNumberPrefix'),
    timezone: str('timezone'),
    taxRate: typeof rate === 'number' && rate >= 0 && rate < 1 ? rate : SETTING_DEFAULTS.taxRate,
    requirePayment:
      typeof requirePayment === 'boolean' ? requirePayment : SETTING_DEFAULTS.requirePayment,
    allowCashPayment:
      typeof allowCash === 'boolean' ? allowCash : SETTING_DEFAULTS.allowCashPayment,
    smileDiscountRate:
      typeof smile === 'number' && smile >= 0 && smile <= 0.5
        ? smile
        : SETTING_DEFAULTS.smileDiscountRate,
  };
}

export async function updateShopSettings(
  input: Partial<ShopSettingsDTO>,
): Promise<ShopSettingsDTO> {
  await prisma.$transaction(
    Object.entries(input)
      .filter(([, value]) => value !== undefined)
      .map(([key, value]) =>
        prisma.setting.upsert({
          where: { key },
          update: { value: value as Prisma.InputJsonValue },
          create: { key, value: value as Prisma.InputJsonValue },
        }),
      ),
  );
  return getShopSettings();
}

export function serializeKiosk(k: Prisma.KioskGetPayload<object>): KioskDTO {
  return {
    id: k.id,
    code: k.code,
    name: k.name,
    location: k.location,
    active: k.active,
    inputMode: k.inputMode,
    sessionTimeoutSeconds: k.sessionTimeoutSeconds,
    successResetSeconds: k.successResetSeconds,
    hoverDelayMs: k.hoverDelayMs,
    lastSeenAt: k.lastSeenAt ? k.lastSeenAt.toISOString() : null,
    createdAt: k.createdAt.toISOString(),
    updatedAt: k.updatedAt.toISOString(),
  };
}

/** Public configuration for a kiosk device. Also acts as a heartbeat. */
export async function getKioskConfig(code: string | undefined): Promise<KioskConfigDTO> {
  const shop = await getShopSettings();
  if (!code) return { shop, kiosk: null };
  const kiosk = await prisma.kiosk.findUnique({ where: { code } });
  if (!kiosk) return { shop, kiosk: null };
  const seen = await prisma.kiosk.update({
    where: { id: kiosk.id },
    data: { lastSeenAt: new Date() },
  });
  return { shop, kiosk: serializeKiosk(seen) };
}
