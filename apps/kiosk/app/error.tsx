'use client';

import { useEffect } from 'react';
import { ErrorState } from '@/components/ui/States';
import { Button } from '@/components/ui/Button';

/** Error boundary screen: never shows technical details to customers. */
export default function ErrorPage({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('Kiosk error boundary:', error);
  }, [error]);

  return (
    <ErrorState
      title="Oops — something went wrong"
      message="Sorry about that. Please try again or start a new order."
      onRetry={reset}
      extra={
        <Button
          variant="secondary"
          onClick={() => {
            try {
              window.sessionStorage.clear();
            } catch {
              /* ignore */
            }
            // A full reload is intentional here: it discards any broken client state.
            // eslint-disable-next-line @next/next/no-location-assign-relative-destination
            window.location.href = '/';
          }}
        >
          Start over
        </Button>
      }
    />
  );
}
