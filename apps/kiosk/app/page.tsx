'use client';

import { ArrowRight, CircleQuestionMark, Crosshair, Hand } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { CameraRequired } from '@/components/kiosk/CameraRequired';
import { HandStatus } from '@/components/kiosk/HandStatus';
import { useKioskAction } from '@/components/providers/ActionsProvider';
import { useInputMode } from '@/components/providers/InputModeProvider';
import { useKioskConfig } from '@/components/providers/KioskConfigProvider';
import { useMenu } from '@/components/providers/MenuProvider';
import { isVisionReady, useVision } from '@/components/providers/VisionProvider';
import { ProductImage } from '@/components/ui/ProductImage';

export default function WelcomePage() {
  const router = useRouter();
  const { effectiveMode, cameraFallback } = useInputMode();
  const { state } = useVision();
  const { products } = useMenu();
  const { shop } = useKioskConfig();
  const cameraProblem = cameraFallback;

  const start = () => router.push('/menu');
  // A held thumbs-up also starts the order.
  useKioskAction('confirm', start);

  const featured = products.filter((p) => p.featured).slice(0, 4);
  const handReady = effectiveMode === 'mouse' || (isVisionReady(state) && state.handDetected);

  return (
    <div className="relative flex h-full flex-col items-center overflow-hidden px-8">
      {/* Decorative floating product art */}
      <div aria-hidden className="pointer-events-none absolute inset-0">
        {featured.map((p, i) => (
          <div
            key={p.id}
            className="absolute size-[16rem] animate-float overflow-hidden rounded-[2.5rem] opacity-25 blur-[1px]"
            style={{
              left: i % 2 === 0 ? `${4 + i * 3}%` : undefined,
              right: i % 2 === 1 ? `${4 + i * 2}%` : undefined,
              top: `${12 + (i >> 1) * 48}%`,
              animationDelay: `${i * 0.8}s`,
              rotate: `${i % 2 === 0 ? -8 : 8}deg`,
            }}
          >
            <ProductImage src={p.image} alt="" className="size-full" />
          </div>
        ))}
      </div>

      <div className="relative flex min-h-0 flex-1 animate-fade-up flex-col items-center justify-center text-center">
        <div className={`relative mb-6 ${cameraProblem ? 'hidden' : ''}`}>
          <div className="absolute -top-10 left-1/2 flex -translate-x-1/2 gap-3" aria-hidden>
            {[0, 1, 2].map((i) => (
              <span
                key={i}
                className="block h-10 w-2 animate-steam rounded-full bg-crema-50/40 blur-[2px]"
                style={{ animationDelay: `${i * 0.6}s` }}
              />
            ))}
          </div>
          <div className="glass-strong size-40 overflow-hidden rounded-full p-1 shadow-2xl">
            <ProductImage
              src="/static/products/latte.svg"
              alt="A cup of coffee"
              className="size-full rounded-full"
            />
          </div>
        </div>

        <p className="text-2xl font-medium uppercase tracking-[0.5em] text-caramel-300">
          Welcome to
        </p>
        <h1
          className={`text-display mt-2 font-semibold leading-none text-crema-50 ${cameraProblem ? 'text-[5rem]' : 'text-[7.5rem]'}`}
        >
          {shop.shopName.toUpperCase()}
        </h1>
        <p className="glass mt-6 rounded-full px-6 py-2 text-2xl text-crema-100">
          Touchless Ordering
        </p>

        <div
          className={`flex flex-col items-center justify-start gap-6 ${cameraProblem ? 'mt-8' : 'mt-12 min-h-[18rem]'}`}
        >
          <p className="flex items-center gap-4 text-3xl text-crema-100">
            {effectiveMode === 'gesture' ? (
              <>
                <Hand className="size-10 animate-float text-caramel-300" aria-hidden />
                Raise your hand to get started
              </>
            ) : (
              'Tap START to begin your order'
            )}
          </p>
          <HandStatus />
          <button
            type="button"
            data-gesture-target
            onClick={start}
            className={`btn btn-primary gesture-target mt-2 px-20 py-7 text-4xl tracking-widest ${handReady ? 'animate-pop' : 'opacity-80'}`}
            style={{ minHeight: '6rem' }}
          >
            START <ArrowRight className="size-9" aria-hidden />
          </button>
          {effectiveMode === 'gesture' && handReady ? (
            <p className="animate-fade-up text-xl text-crema-300">
              Point at START, then pinch 🤏 to select
            </p>
          ) : null}
          {/* Camera down: the kiosk keeps working with mouse/touch; gestures resume automatically. */}
          {cameraProblem ? <CameraRequired compact /> : null}
        </div>
      </div>

      <footer className="relative flex w-full shrink-0 items-center justify-center gap-4 pb-5 pt-2 text-lg">
        <Link
          href="/help"
          data-gesture-target
          className="btn btn-ghost gesture-target min-h-0 px-6 py-3 text-lg"
        >
          <CircleQuestionMark className="size-6" aria-hidden /> How does it work?
        </Link>
        <Link
          href="/calibration"
          data-gesture-target
          aria-label="Camera calibration (staff)"
          className="btn btn-ghost gesture-target absolute right-0 min-h-0 px-4 py-3 text-base opacity-50"
        >
          <Crosshair className="size-5" aria-hidden /> Calibrate
        </Link>
      </footer>
    </div>
  );
}
