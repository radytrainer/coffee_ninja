'use client';

import type { CategoryDTO, ProductDTO } from '@gcs/types';
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
import { api, ApiError } from '@/lib/api';

type Status = 'loading' | 'ready' | 'error';

interface MenuValue {
  status: Status;
  error: string | null;
  categories: CategoryDTO[];
  products: ProductDTO[];
  productById: (id: string) => ProductDTO | undefined;
  reload: (options?: { silent?: boolean }) => Promise<void>;
}

const MenuContext = createContext<MenuValue | null>(null);

/** Loads the menu once and keeps it in memory for instant navigation. */
export function MenuProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<Status>('loading');
  const [error, setError] = useState<string | null>(null);
  const [categories, setCategories] = useState<CategoryDTO[]>([]);
  const [products, setProducts] = useState<ProductDTO[]>([]);
  const loadedOnce = useRef(false);

  const reload = useCallback(async ({ silent = false }: { silent?: boolean } = {}) => {
    if (!silent || !loadedOnce.current) setStatus('loading');
    try {
      const [cats, prods] = await Promise.all([api.categories(), api.products()]);
      setCategories(cats);
      setProducts(prods);
      setError(null);
      setStatus('ready');
      loadedOnce.current = true;
    } catch (e) {
      // A silent refresh failure keeps the menu we already have.
      if (silent && loadedOnce.current) return;
      setError(e instanceof ApiError ? e.message : 'Could not load the menu.');
      setStatus('error');
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void reload();
  }, [reload]);

  const value = useMemo<MenuValue>(() => {
    const map = new Map(products.map((p) => [p.id, p]));
    return { status, error, categories, products, productById: (id) => map.get(id), reload };
  }, [status, error, categories, products, reload]);

  return <MenuContext.Provider value={value}>{children}</MenuContext.Provider>;
}

export function useMenu() {
  const ctx = useContext(MenuContext);
  if (!ctx) throw new Error('useMenu must be used inside MenuProvider');
  return ctx;
}
