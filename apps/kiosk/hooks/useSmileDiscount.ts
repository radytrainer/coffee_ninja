'use client';

import { useCallback, useEffect, useState } from 'react';
import { useVision } from '@/components/providers/VisionProvider';

export interface SmileState {
  /** Signed token from the vision service once the customer held a smile. */
  token: string | null;
  faceDetected: boolean;
  /** 0..1 progress of holding the smile. */
  progress: number;
}

/**
 * Listens for the vision service's smile events while `enabled` (the checkout
 * screen). The token proves the smile to the API, which applies the discount.
 */
export function useSmileDiscount(enabled: boolean) {
  const { subscribe } = useVision();
  const [state, setState] = useState<SmileState>({ token: null, faceDetected: false, progress: 0 });

  useEffect(() => {
    if (!enabled) return;
    return subscribe((event) => {
      if (event.type === 'face') {
        setState((s) => {
          const progress = s.token ? 1 : Math.round(event.smileProgress * 20) / 20; // 5 % steps: fewer re-renders
          return s.faceDetected === event.faceDetected && s.progress === progress
            ? s
            : { ...s, faceDetected: event.faceDetected, progress };
        });
      } else if (event.type === 'smile') {
        // Keep the first token — one discount per order.
        setState((s) => (s.token ? s : { ...s, token: event.token, progress: 1 }));
      }
    });
  }, [enabled, subscribe]);

  /** Drops a token the API rejected (expired / already used) so the customer can smile again. */
  const discard = useCallback(() => setState((s) => ({ ...s, token: null, progress: 0 })), []);

  return { ...state, discard };
}
