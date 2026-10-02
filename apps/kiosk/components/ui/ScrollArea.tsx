'use client';

import { ChevronDown, ChevronUp } from 'lucide-react';
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';

/**
 * Scroll container for gesture use. When content overflows, a slim rail with
 * large "page up / page down" buttons appears beside it (never on top of the
 * content), so customers can scroll with a simple pinch — no drag gestures.
 */
export function ScrollArea({
  children,
  className = '',
}: {
  children: ReactNode;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [overflowing, setOverflowing] = useState(false);
  const [canUp, setCanUp] = useState(false);
  const [canDown, setCanDown] = useState(false);

  const update = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    setOverflowing(el.scrollHeight > el.clientHeight + 4);
    setCanUp(el.scrollTop > 4);
    setCanDown(el.scrollTop + el.clientHeight < el.scrollHeight - 4);
  }, []);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    update();
    const observer = new ResizeObserver(update);
    observer.observe(el);
    Array.from(el.children).forEach((c) => observer.observe(c));
    el.addEventListener('scroll', update, { passive: true });
    return () => {
      observer.disconnect();
      el.removeEventListener('scroll', update);
    };
  }, [update, children]);

  const page = (direction: 1 | -1) => {
    const el = ref.current;
    if (!el) return;
    el.scrollBy({ top: direction * el.clientHeight * 0.75, behavior: 'smooth' });
  };

  const railButton =
    'gesture-target glass-strong flex h-20 w-14 items-center justify-center rounded-2xl text-crema-50 outline-none';

  return (
    <div className={`relative flex min-h-0 gap-3 ${className}`}>
      <div
        ref={ref}
        data-scroll-area
        className="h-full min-w-0 flex-1 overflow-y-auto overscroll-contain px-1 py-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {children}
      </div>
      {overflowing ? (
        <div
          className="flex w-14 shrink-0 flex-col justify-between py-1"
          aria-label="Scroll controls"
        >
          <button
            type="button"
            data-gesture-target
            aria-label="Scroll up"
            disabled={!canUp}
            onClick={() => page(-1)}
            className={railButton}
          >
            <ChevronUp className="size-8" aria-hidden />
          </button>
          <div className="mx-auto w-1 flex-1 rounded-full bg-crema-50/10 my-3" aria-hidden />
          <button
            type="button"
            data-gesture-target
            aria-label="Scroll down"
            disabled={!canDown}
            onClick={() => page(1)}
            className={railButton}
          >
            <ChevronDown className="size-8" aria-hidden />
          </button>
        </div>
      ) : null}
    </div>
  );
}
