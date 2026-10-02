'use client';

import { Hand } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { useKioskAction } from '@/components/providers/ActionsProvider';

export function InactivityDialog({
  secondsLeft,
  onContinue,
  onReset,
}: {
  secondsLeft: number;
  onContinue: () => void;
  onReset: () => void;
}) {
  // Open palm / Escape keeps the session alive while the dialog is open.
  useKioskAction('back', onContinue);
  return (
    <Modal labelledBy="inactivity-title">
      <div className="mx-auto mb-6 flex size-24 items-center justify-center rounded-full bg-caramel-400/20 text-caramel-300">
        <Hand className="size-12 animate-float" aria-hidden />
      </div>
      <h2 id="inactivity-title" className="text-display text-5xl text-crema-50">
        Are you still there?
      </h2>
      <p className="mt-4 text-2xl text-crema-300">
        Your order will be cleared in{' '}
        <span className="font-semibold tabular-nums text-caramel-300">{secondsLeft}</span> seconds.
      </p>
      <div className="mt-8 flex justify-center gap-4">
        <Button variant="secondary" onClick={onReset}>
          Start over
        </Button>
        <Button onClick={onContinue}>I&apos;m still here</Button>
      </div>
    </Modal>
  );
}
