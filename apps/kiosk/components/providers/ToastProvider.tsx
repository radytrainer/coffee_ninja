'use client';

import { CircleCheck, Info, TriangleAlert } from 'lucide-react';
import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';

type Tone = 'info' | 'success' | 'error';

interface Toast {
  id: number;
  message: string;
  tone: Tone;
  action?: { label: string; onClick: () => void };
}

interface ToastOptions {
  tone?: Tone;
  durationMs?: number;
  action?: Toast['action'];
  /** Messages with the same key are not repeated within durationMs (e.g. invalid gesture hints). */
  dedupeKey?: string;
}

const ToastContext = createContext<((message: string, options?: ToastOptions) => void) | null>(
  null,
);

const icons = { info: Info, success: CircleCheck, error: TriangleAlert };
const toneClass: Record<Tone, string> = {
  info: 'text-crema-50',
  success: 'text-mint-300',
  error: 'text-berry-300',
};

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const counter = useRef(0);
  const recent = useRef(new Map<string, number>());

  const dismiss = useCallback(
    (id: number) => setToasts((all) => all.filter((t) => t.id !== id)),
    [],
  );

  const show = useCallback(
    (
      message: string,
      { tone = 'info', durationMs = 2600, action, dedupeKey }: ToastOptions = {},
    ) => {
      const now = Date.now();
      if (dedupeKey) {
        const last = recent.current.get(dedupeKey) ?? 0;
        if (now - last < durationMs) return;
        recent.current.set(dedupeKey, now);
      }
      counter.current += 1;
      const id = counter.current;
      setToasts((all) => [...all.slice(-2), { id, message, tone, action }]);
      window.setTimeout(() => dismiss(id), durationMs);
    },
    [dismiss],
  );

  const value = useMemo(() => show, [show]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div
        className="pointer-events-none fixed inset-x-0 top-6 z-[60] flex flex-col items-center gap-3"
        role="status"
        aria-live="polite"
      >
        {toasts.map((t) => {
          const Icon = icons[t.tone];
          return (
            <div
              key={t.id}
              className="glass-strong pointer-events-auto flex animate-pop items-center gap-4 rounded-full py-3 pl-5 pr-3 text-lg shadow-2xl"
            >
              <Icon className={`size-6 shrink-0 ${toneClass[t.tone]}`} aria-hidden />
              <span className="text-crema-50">{t.message}</span>
              {t.action ? (
                <button
                  type="button"
                  data-gesture-target
                  className="btn btn-secondary gesture-target min-h-0 px-5 py-2 text-base"
                  onClick={() => {
                    t.action?.onClick();
                    dismiss(t.id);
                  }}
                >
                  {t.action.label}
                </button>
              ) : (
                <span className="w-2" />
              )}
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used inside ToastProvider');
  return ctx;
}
