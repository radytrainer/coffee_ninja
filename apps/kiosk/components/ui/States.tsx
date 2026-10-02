import { LoaderCircle, TriangleAlert, WifiOff } from 'lucide-react';
import type { ReactNode } from 'react';
import { Button } from './Button';

export function Spinner({ className = 'size-10' }: { className?: string }) {
  return (
    <LoaderCircle className={`animate-spin text-caramel-300 ${className}`} aria-label="Loading" />
  );
}

export function LoadingState({ label = 'Loading…' }: { label?: string }) {
  return (
    <div
      className="flex h-full flex-col items-center justify-center gap-5 text-crema-200"
      role="status"
    >
      <Spinner className="size-14" />
      <p className="text-2xl">{label}</p>
    </div>
  );
}

export function EmptyState({
  icon,
  title,
  message,
  action,
}: {
  icon: ReactNode;
  title: string;
  message?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex h-full animate-fade-up flex-col items-center justify-center gap-5 text-center">
      <div className="glass flex size-28 items-center justify-center rounded-full text-caramel-300">
        {icon}
      </div>
      <h2 className="text-display text-4xl text-crema-50">{title}</h2>
      {message ? <p className="max-w-xl text-xl text-crema-300">{message}</p> : null}
      {action}
    </div>
  );
}

export function ErrorState({
  title = 'Something went wrong',
  message,
  network = false,
  onRetry,
  extra,
}: {
  title?: string;
  message: string;
  network?: boolean;
  onRetry?: () => void;
  extra?: ReactNode;
}) {
  const Icon = network ? WifiOff : TriangleAlert;
  return (
    <div
      className="flex h-full animate-fade-up flex-col items-center justify-center gap-5 text-center"
      role="alert"
    >
      <div className="flex size-28 items-center justify-center rounded-full bg-berry-500/15 text-berry-300 ring-1 ring-berry-400/40">
        <Icon className="size-12" aria-hidden />
      </div>
      <h2 className="text-display text-4xl text-crema-50">{title}</h2>
      <p className="max-w-xl text-xl text-crema-300">{message}</p>
      <div className="flex gap-4">
        {onRetry ? (
          <Button onClick={onRetry} variant="primary">
            Try again
          </Button>
        ) : null}
        {extra}
      </div>
    </div>
  );
}
