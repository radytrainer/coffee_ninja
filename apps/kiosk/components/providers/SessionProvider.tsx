'use client';

import { usePathname, useRouter } from 'next/navigation';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { config } from '@/lib/config';
import { InactivityDialog } from '@/components/kiosk/InactivityDialog';
import { useCart } from './CartProvider';
import { useKioskConfig } from './KioskConfigProvider';
import { useMenu } from './MenuProvider';

interface SessionValue {
  /** Record user activity (pointer, keyboard, gesture). */
  markActivity: () => void;
  /** Clears the cart and all customer state and returns to the welcome screen. */
  resetSession: () => void;
}

const SessionContext = createContext<SessionValue | null>(null);

/** Screens where the inactivity timeout does not apply. */
// /pay: the customer is busy with their phone — the payment timeout handles abandonment.
const EXEMPT = [/^\/$/, /^\/order\//, /^\/pay\//, /^\/calibration/];

export function SessionProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const { dispatch } = useCart();
  const { reload } = useMenu();
  const { sessionTimeoutSeconds } = useKioskConfig();
  const lastActivity = useRef(0);
  const [warning, setWarning] = useState<number | null>(null);

  const markActivity = useCallback(() => {
    lastActivity.current = Date.now();
  }, []);

  const resetSession = useCallback(() => {
    dispatch({ type: 'clear' });
    try {
      window.sessionStorage.clear();
    } catch {
      /* ignore */
    }
    setWarning(null);
    router.replace('/');
    // Refresh prices/availability for the next customer.
    void reload({ silent: true });
  }, [dispatch, reload, router]);

  useEffect(() => {
    lastActivity.current = Date.now();
    const events = ['pointermove', 'pointerdown', 'keydown', 'wheel'] as const;
    events.forEach((e) => window.addEventListener(e, markActivity, { passive: true }));
    return () => events.forEach((e) => window.removeEventListener(e, markActivity));
  }, [markActivity]);

  // Navigating counts as activity.
  useEffect(() => {
    lastActivity.current = Date.now();
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setWarning(null);
  }, [pathname]);

  useEffect(() => {
    if (EXEMPT.some((re) => re.test(pathname))) return;
    const timer = window.setInterval(() => {
      const idleSeconds = (Date.now() - lastActivity.current) / 1000;
      const remaining = Math.ceil(
        sessionTimeoutSeconds + config.inactivityWarningSeconds - idleSeconds,
      );
      if (idleSeconds >= sessionTimeoutSeconds) {
        if (remaining <= 0) resetSession();
        else setWarning(remaining);
      } else {
        setWarning((w) => (w === null ? w : null));
      }
    }, 500);
    return () => window.clearInterval(timer);
  }, [pathname, resetSession, sessionTimeoutSeconds]);

  const value = useMemo(() => ({ markActivity, resetSession }), [markActivity, resetSession]);

  return (
    <SessionContext.Provider value={value}>
      {children}
      {warning !== null ? (
        <InactivityDialog
          secondsLeft={warning}
          onContinue={() => {
            markActivity();
            setWarning(null);
          }}
          onReset={resetSession}
        />
      ) : null}
    </SessionContext.Provider>
  );
}

export function useSession() {
  const ctx = useContext(SessionContext);
  if (!ctx) throw new Error('useSession must be used inside SessionProvider');
  return ctx;
}
