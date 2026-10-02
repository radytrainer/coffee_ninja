'use client';

import { useCallback, useEffect, useState } from 'react';
import { api, ApiError } from './api';

/** Loads a resource with loading / error state and a reload function. */
export function useResource<T>(path: string | null) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const reload = useCallback(async () => {
    if (!path) return;
    setLoading(true);
    try {
      setData(await api.get<T>(path));
      setError(null);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Failed to load');
    } finally {
      setLoading(false);
    }
  }, [path]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void reload();
  }, [reload]);

  return { data, error, loading, reload, setData };
}

export function errorMessage(e: unknown): string {
  if (e instanceof ApiError) {
    // Validation errors arrive as "field: message" — show admins just the readable sentence.
    const detail = e.details?.[0];
    return detail?.message ?? e.message;
  }
  return 'Something went wrong';
}
