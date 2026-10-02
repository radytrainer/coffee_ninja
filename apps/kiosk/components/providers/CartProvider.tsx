'use client';

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  useState,
  type Dispatch,
  type ReactNode,
} from 'react';
import {
  type CartAction,
  type CartState,
  type CartTotals,
  cartReducer,
  cartTotals,
} from '@/lib/cart';
import { useKioskConfig } from './KioskConfigProvider';

const STORAGE_KEY = 'gcs:cart';

interface CartValue {
  state: CartState;
  dispatch: Dispatch<CartAction>;
  totals: CartTotals;
  /** False until the saved cart has been restored — don't treat the cart as empty before that. */
  hydrated: boolean;
}

const CartContext = createContext<CartValue | null>(null);

/**
 * Cart lives in memory and is mirrored to sessionStorage so an accidental page
 * reload doesn't lose the customer's order. It is cleared on session reset.
 */
export function CartProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(cartReducer, { lines: [] });
  const { shop } = useKioskConfig();
  // Persisting must wait until the stored cart has been restored and rendered;
  // otherwise the initial empty state would overwrite it.
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    try {
      const raw = window.sessionStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as CartState;
        if (Array.isArray(parsed.lines)) dispatch({ type: 'hydrate', state: parsed });
      }
    } catch {
      /* corrupt storage: start empty */
    }
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    try {
      window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch {
      /* ignore */
    }
  }, [state, hydrated]);

  const value = useMemo(
    () => ({ state, dispatch, totals: cartTotals(state.lines, shop.taxRate), hydrated }),
    [state, shop.taxRate, hydrated],
  );
  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart() {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error('useCart must be used inside CartProvider');
  return ctx;
}
