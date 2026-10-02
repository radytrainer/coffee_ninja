'use client';

import type { ReactNode } from 'react';
import { ActionsProvider } from '@/components/providers/ActionsProvider';
import { CartProvider } from '@/components/providers/CartProvider';
import { InputModeProvider } from '@/components/providers/InputModeProvider';
import { KioskConfigProvider } from '@/components/providers/KioskConfigProvider';
import { MenuProvider } from '@/components/providers/MenuProvider';
import { SessionProvider } from '@/components/providers/SessionProvider';
import { ToastProvider } from '@/components/providers/ToastProvider';
import { VisionProvider } from '@/components/providers/VisionProvider';
import { KioskChrome } from '@/components/kiosk/KioskChrome';

/**
 * Layering (outer → inner):
 * config → input mode → vision (gesture events) → actions (back/confirm) →
 * toasts → menu data → cart → session (inactivity reset) → UI
 */
export function Providers({ children }: { children: ReactNode }) {
  return (
    <KioskConfigProvider>
      <InputModeProvider>
        <VisionProvider>
          <ActionsProvider>
            <ToastProvider>
              <MenuProvider>
                <CartProvider>
                  <SessionProvider>
                    {children}
                    <KioskChrome />
                  </SessionProvider>
                </CartProvider>
              </MenuProvider>
            </ToastProvider>
          </ActionsProvider>
        </VisionProvider>
      </InputModeProvider>
    </KioskConfigProvider>
  );
}
