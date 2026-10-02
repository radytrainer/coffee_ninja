import type { OrderStatus } from '@gcs/types';
import { Check, ChefHat, CircleCheck, ClipboardList, Coffee, X } from 'lucide-react';

const STEPS: { status: OrderStatus; label: string; icon: typeof Check }[] = [
  { status: 'NEW', label: 'Received', icon: ClipboardList },
  { status: 'ACCEPTED', label: 'Accepted', icon: Check },
  { status: 'PREPARING', label: 'Preparing', icon: ChefHat },
  { status: 'READY', label: 'Ready', icon: Coffee },
  { status: 'COMPLETED', label: 'Completed', icon: CircleCheck },
];

export function StatusTracker({ status }: { status: OrderStatus }) {
  if (status === 'CANCELLED') {
    return (
      <div className="flex items-center justify-center gap-3 rounded-2xl bg-berry-500/15 px-6 py-4 text-xl text-berry-300 ring-1 ring-berry-400/30">
        <X className="size-7" aria-hidden /> This order was cancelled. Please see a staff member.
      </div>
    );
  }
  const current = STEPS.findIndex((s) => s.status === status);
  return (
    <ol className="flex items-start justify-between gap-2" aria-label="Order progress">
      {STEPS.map((step, index) => {
        const doneStep = index < current;
        const active = index === current;
        const Icon = step.icon;
        return (
          <li
            key={step.status}
            className="flex flex-1 flex-col items-center gap-2 text-center"
            aria-current={active ? 'step' : undefined}
          >
            <div className="relative flex w-full items-center">
              <div
                className={`h-1 flex-1 rounded ${index === 0 ? 'opacity-0' : doneStep || active ? 'bg-caramel-400' : 'bg-crema-50/15'}`}
              />
              <div
                className={`relative flex size-14 items-center justify-center rounded-full transition-all duration-500 ${
                  active
                    ? 'scale-110 bg-caramel-400 text-espresso-950 shadow-[0_0_30px_rgba(234,165,79,0.6)]'
                    : doneStep
                      ? 'bg-caramel-500/80 text-espresso-950'
                      : 'bg-crema-50/10 text-crema-400'
                }`}
              >
                {active ? (
                  <span className="absolute inset-0 animate-pulse-ring rounded-full bg-caramel-400/50" />
                ) : null}
                <Icon className="relative size-7" aria-hidden />
              </div>
              <div
                className={`h-1 flex-1 rounded ${index === STEPS.length - 1 ? 'opacity-0' : doneStep ? 'bg-caramel-400' : 'bg-crema-50/15'}`}
              />
            </div>
            <span
              className={`text-base ${active ? 'font-semibold text-crema-50' : 'text-crema-300'}`}
            >
              {step.label}
            </span>
          </li>
        );
      })}
    </ol>
  );
}
