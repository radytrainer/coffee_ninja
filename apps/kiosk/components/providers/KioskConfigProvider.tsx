'use client';

import type { KioskDTO, ShopSettingsDTO } from '@gcs/types';
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { api } from '@/lib/api';
import { config } from '@/lib/config';

export interface KioskSettings {
  shop: ShopSettingsDTO;
  kiosk: KioskDTO | null;
  sessionTimeoutSeconds: number;
  successResetSeconds: number;
  hoverDelayMs: number;
  loaded: boolean;
}

const DEFAULT_SHOP: ShopSettingsDTO = {
  shopName: 'PNC Coffee',
  currency: 'USD',
  taxRate: 0.1,
  orderNumberPrefix: 'A',
  timezone: 'Asia/Phnom_Penh',
  requirePayment: true,
  allowCashPayment: true,
  smileDiscountRate: 0,
};

const defaults: KioskSettings = {
  shop: DEFAULT_SHOP,
  kiosk: null,
  sessionTimeoutSeconds: config.sessionTimeoutSeconds,
  successResetSeconds: config.successResetSeconds,
  hoverDelayMs: config.hoverDelayMs,
  loaded: false,
};

const KioskConfigContext = createContext<KioskSettings>(defaults);

/** Loads shop + kiosk settings from the API (also acts as a kiosk heartbeat every minute). */
export function KioskConfigProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<KioskSettings>(defaults);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const data = await api.kioskConfig(config.kioskCode);
        if (cancelled) return;
        setSettings({
          shop: data.shop,
          kiosk: data.kiosk,
          sessionTimeoutSeconds: data.kiosk?.sessionTimeoutSeconds ?? config.sessionTimeoutSeconds,
          successResetSeconds: data.kiosk?.successResetSeconds ?? config.successResetSeconds,
          hoverDelayMs: data.kiosk?.hoverDelayMs ?? config.hoverDelayMs,
          loaded: true,
        });
      } catch {
        // Keep defaults; the next heartbeat retries.
      }
    };
    void load();
    const timer = window.setInterval(load, 60_000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, []);

  return <KioskConfigContext.Provider value={settings}>{children}</KioskConfigContext.Provider>;
}

export const useKioskConfig = () => useContext(KioskConfigContext);

export function useMoney() {
  const { shop } = useKioskConfig();
  return useMemo(() => {
    const formatter = new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: shop.currency || 'USD',
    });
    return (amount: number) => formatter.format(amount);
  }, [shop.currency]);
}
