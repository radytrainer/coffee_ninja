'use client';

import { useEffect, useRef, type ReactNode } from 'react';

/** Accessible modal overlay; focuses the first interactive element for keyboard users. */
export function Modal({ children, labelledBy }: { children: ReactNode; labelledBy: string }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const first = ref.current?.querySelector<HTMLElement>('[data-gesture-target]');
    first?.focus({ preventScroll: true });
  }, []);
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-espresso-950/70 p-8 backdrop-blur-md">
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-labelledby={labelledBy}
        className="glass-strong w-full max-w-2xl animate-pop rounded-[2rem] p-10 text-center shadow-2xl"
      >
        {children}
      </div>
    </div>
  );
}
