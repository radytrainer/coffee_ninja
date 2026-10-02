'use client';

import { ChevronsLeftRight, Hand, ThumbsUp } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { TopBar } from '@/components/kiosk/TopBar';
import { useKioskAction } from '@/components/providers/ActionsProvider';
import { Button } from '@/components/ui/Button';

const STEPS = [
  {
    emoji: '☝️',
    title: 'Point',
    text: 'Move your index finger.',
    detail: 'A glowing cursor follows your fingertip.',
  },
  {
    emoji: '🤏',
    title: 'Pinch',
    text: 'Bring your thumb and index finger together to select.',
    detail: 'Rest on a button for a moment until it glows, then pinch.',
  },
  {
    emoji: '🛒',
    title: 'Order',
    text: 'Choose your drink and confirm your order.',
    detail: 'Pinch and hold the confirm button to place it.',
  },
];

export default function HelpPage() {
  const router = useRouter();
  const back = () => router.back();
  useKioskAction('back', back);

  return (
    <div className="flex h-full flex-col">
      <TopBar onBack={back} title="How it works" showHelp={false} />
      <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-10 px-10 pb-10">
        <ol className="grid w-full max-w-7xl grid-cols-3 gap-8">
          {STEPS.map((step, i) => (
            <li
              key={step.title}
              className="glass flex animate-fade-up flex-col items-center rounded-[2rem] p-10 text-center"
              style={{ animationDelay: `${i * 120}ms` }}
            >
              <span className="text-lg font-semibold uppercase tracking-[0.3em] text-caramel-300">
                Step {i + 1}
              </span>
              <span
                className="mt-6 animate-float text-[6rem] leading-none"
                style={{ animationDelay: `${i * 0.5}s` }}
                aria-hidden
              >
                {step.emoji}
              </span>
              <h2 className="text-display mt-6 text-5xl text-crema-50">{step.title}</h2>
              <p className="mt-4 text-2xl text-crema-100">&ldquo;{step.text}&rdquo;</p>
              <p className="mt-3 text-lg text-crema-400">{step.detail}</p>
            </li>
          ))}
        </ol>
        <ul className="grid w-full max-w-7xl grid-cols-2 gap-4 text-xl text-crema-200 xl:grid-cols-4">
          {[
            { icon: <Hand className="size-7" aria-hidden />, text: 'Hold an open palm to go back' },
            { icon: <ThumbsUp className="size-7" aria-hidden />, text: 'Thumbs up to confirm' },
            {
              icon: <span className="text-3xl leading-none">✌️</span>,
              text: 'Two fingers up, move your hand to scroll',
            },
            {
              icon: <ChevronsLeftRight className="size-7" aria-hidden />,
              text: 'On the menu, move your open hand left or right to browse',
            },
          ].map((tip) => (
            <li key={tip.text} className="glass flex items-center gap-4 rounded-2xl px-5 py-4">
              <span className="flex size-12 shrink-0 items-center justify-center rounded-full bg-caramel-400/15 text-caramel-300">
                {tip.icon}
              </span>
              {tip.text}
            </li>
          ))}
        </ul>
        <p className="text-lg text-crema-400">
          Mouse & keyboard work too · “+” / “−” keys change the text size
        </p>
        <Button onClick={back} className="px-16 text-2xl">
          Got it!
        </Button>
      </div>
    </div>
  );
}
