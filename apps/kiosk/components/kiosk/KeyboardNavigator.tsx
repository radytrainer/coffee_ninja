'use client';

import { useEffect } from 'react';
import { useKioskActions } from '@/components/providers/ActionsProvider';
import { focusableTargets, moveFocus, type Direction } from '@/lib/spatialNavigation';

const KEY_TO_DIRECTION: Record<string, Direction> = {
  ArrowUp: 'up',
  ArrowDown: 'down',
  ArrowLeft: 'left',
  ArrowRight: 'right',
};

/**
 * Keyboard fallback (required for accessibility):
 *   Arrow keys → move between buttons spatially
 *   Enter      → select (native button behaviour; focuses the first button if none)
 *   Escape     → back
 */
export function KeyboardNavigator() {
  const { trigger } = useKioskActions();

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.altKey || e.ctrlKey || e.metaKey) return;
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;

      const direction = KEY_TO_DIRECTION[e.key];
      if (direction) {
        e.preventDefault();
        moveFocus(direction);
        return;
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        trigger('back');
        return;
      }
      if (e.key === 'Enter') {
        const active = document.activeElement as HTMLElement | null;
        if (!active || active === document.body) {
          e.preventDefault();
          focusableTargets()[0]?.focus();
        }
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [trigger]);

  return null;
}
