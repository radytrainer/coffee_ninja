'use client';

import type { ProductDTO } from '@gcs/types';
import { ChevronLeft, ChevronRight, Star } from 'lucide-react';
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useInputMode } from '@/components/providers/InputModeProvider';
import { useMoney } from '@/components/providers/KioskConfigProvider';
import { ProductImage } from '@/components/ui/ProductImage';
import { clampIndex, rubberBand, snapIndex, trackOffset } from '@/lib/carousel';
import { easeFactor, releaseVelocity } from '@/lib/gesture/handScroll';
import { registerSwipeTarget } from '@/lib/gesture/swipe';
import { sounds } from '@/lib/sound';

interface Props {
  products: ProductDTO[];
  onSelect: (product: ProductDTO) => void;
}

const GAP = 32; // px between cards
const DRAG_THRESHOLD = 8; // px before a pointer press becomes a drag (keeps clicks working)
const SETTLE = 'transform 450ms cubic-bezier(0.22, 0.8, 0.2, 1)';
/** Time constant (ms) of the cards easing toward the hand (camera updates arrive at 15–30/s). */
const FOLLOW_MS = 60;
/** A hand sweep moves on after 30 % of a card (mouse/touch: halfway). */
const HAND_COMMIT = 0.3;

/**
 * Slideshow: one big product card at a time, neighbours peeking at the sides.
 * Move it with an open hand ✋ (or ✌️) left/right via the GestureLayer, by dragging
 * with mouse/touch, with the arrow buttons, or by picking a neighbour card.
 *
 * Hand drags are smoothed: each camera update sets a target offset and the cards
 * ease toward it every animation frame, so they glide instead of stepping.
 */
export function ProductCarousel({ products, onSelect }: Props) {
  const money = useMoney();
  const { effectiveMode } = useInputMode();
  const [index, setIndex] = useState(0);
  const indexRef = useRef(0);
  const viewport = useRef<HTMLDivElement>(null);
  const track = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ width: 0, slide: 0 });
  const sizeRef = useRef(size);
  const dragPx = useRef(0);
  const dragging = useRef(false);
  const suppressClick = useRef(false);
  const count = products.length;

  // Measure: the card takes most of the width so it reads as "one card at a time".
  useLayoutEffect(() => {
    const el = viewport.current;
    if (!el) return;
    const measure = () => {
      const width = el.clientWidth;
      const next = { width, slide: Math.round(Math.min(width * 0.68, 64 * 16)) };
      sizeRef.current = next;
      setSize(next);
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  /** Writes the track position directly (no React render per drag frame). */
  const apply = useCallback((animate: boolean) => {
    const el = track.current;
    const { width, slide } = sizeRef.current;
    if (!el || !slide) return;
    el.style.transition = animate ? SETTLE : 'none';
    el.style.transform = `translate3d(${trackOffset(indexRef.current, width, slide, GAP) + dragPx.current}px,0,0)`;
  }, []);

  const goTo = useCallback(
    (next: number) => {
      const target = clampIndex(next, count);
      dragPx.current = 0;
      if (target !== indexRef.current) sounds.hover();
      indexRef.current = target;
      setIndex(target);
      apply(true);
    },
    [apply, count],
  );

  useLayoutEffect(() => apply(false), [apply, size]);

  // Hand drag: target set by camera updates, rendered offset eased per frame.
  const handTarget = useRef(0);
  const frame = useRef<number | null>(null);
  const lastFrame = useRef(0);
  const stopFollow = useCallback(() => {
    if (frame.current !== null) cancelAnimationFrame(frame.current);
    frame.current = null;
  }, []);
  const follow = useCallback(() => {
    if (frame.current !== null) return;
    lastFrame.current = performance.now();
    const tick = (now: number) => {
      frame.current = null;
      if (!dragging.current) return;
      const dt = Math.min(64, now - lastFrame.current);
      lastFrame.current = now;
      dragPx.current += (handTarget.current - dragPx.current) * easeFactor(dt, FOLLOW_MS);
      apply(false);
      if (Math.abs(handTarget.current - dragPx.current) > 0.3)
        frame.current = requestAnimationFrame(tick);
    };
    frame.current = requestAnimationFrame(tick);
  }, [apply]);
  useEffect(() => stopFollow, [stopFollow]);

  // ✋ / ✌️ hand swipe (driven by the GestureLayer).
  useEffect(() => {
    const el = viewport.current;
    if (!el) return;
    return registerSwipeTarget({
      element: el,
      dragStart: () => {
        stopFollow();
        dragging.current = true;
        dragPx.current = handTarget.current = 0;
      },
      dragMove: (offset) => {
        handTarget.current = rubberBand(offset, indexRef.current, count);
        follow();
      },
      dragEnd: (velocity) => {
        stopFollow();
        dragging.current = false;
        // Snap by where the hand was going; the CSS transition starts from where the cards are.
        // Release speed pointing the other way (the hand turning around) is ignored.
        const drag = handTarget.current;
        const v = Math.sign(velocity) === Math.sign(drag) ? velocity : 0;
        goTo(snapIndex(indexRef.current, drag, v, sizeRef.current.slide + GAP, count, HAND_COMMIT));
      },
    });
  }, [count, follow, goTo, stopFollow]);

  // Mouse / touch drag.
  const pointer = useRef<{
    id: number;
    startX: number;
    samples: { t: number; y: number }[];
  } | null>(null);
  const onPointerDown = (e: React.PointerEvent) => {
    if (e.button !== 0) return;
    pointer.current = {
      id: e.pointerId,
      startX: e.clientX,
      samples: [{ t: performance.now(), y: 0 }],
    };
  };
  const onPointerMove = (e: React.PointerEvent) => {
    const p = pointer.current;
    if (!p || p.id !== e.pointerId) return;
    const dx = e.clientX - p.startX;
    if (!dragging.current) {
      if (Math.abs(dx) < DRAG_THRESHOLD) return;
      dragging.current = true;
      viewport.current?.setPointerCapture(e.pointerId);
    }
    p.samples.push({ t: performance.now(), y: dx });
    if (p.samples.length > 12) p.samples.shift();
    dragPx.current = rubberBand(dx, indexRef.current, count);
    apply(false);
  };
  const onPointerUp = (e: React.PointerEvent) => {
    const p = pointer.current;
    pointer.current = null;
    if (!p || p.id !== e.pointerId || !dragging.current) return;
    dragging.current = false;
    suppressClick.current = true; // the release that ends a drag is not a click
    window.setTimeout(() => (suppressClick.current = false), 0);
    goTo(
      snapIndex(
        indexRef.current,
        dragPx.current,
        releaseVelocity(p.samples, performance.now()),
        sizeRef.current.slide + GAP,
        count,
      ),
    );
  };

  if (count === 0) return null;
  const current = products[index];

  return (
    <div
      className="relative flex min-h-0 flex-1 flex-col"
      role="region"
      aria-roledescription="carousel"
      aria-label="Products"
    >
      <div
        ref={viewport}
        className="relative min-h-0 flex-1 touch-pan-y select-none overflow-hidden"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onClickCapture={(e) => {
          if (suppressClick.current) {
            e.preventDefault();
            e.stopPropagation();
          }
        }}
        data-testid="product-carousel"
      >
        <div
          ref={track}
          className="flex h-full items-stretch py-2"
          style={{ gap: GAP, willChange: 'transform' }}
        >
          {products.map((product, i) => {
            const offset = Math.abs(i - index);
            return (
              <div
                key={product.id}
                className="h-full shrink-0 transition-[opacity,transform] duration-500"
                style={{
                  width: size.slide || '68%',
                  opacity: offset === 0 ? 1 : offset === 1 ? 0.45 : 0,
                  transform: offset === 0 ? 'none' : 'scale(0.88)',
                  visibility: offset > 2 ? 'hidden' : 'visible',
                }}
                aria-hidden={offset !== 0 || undefined}
              >
                <Slide
                  product={product}
                  active={offset === 0}
                  money={money}
                  onPick={() => (offset === 0 ? onSelect(product) : goTo(i))}
                />
              </div>
            );
          })}
        </div>

        <ArrowButton side="left" disabled={index === 0} onClick={() => goTo(index - 1)} />
        <ArrowButton side="right" disabled={index >= count - 1} onClick={() => goTo(index + 1)} />
      </div>

      <div className="flex items-center justify-center gap-5 pt-4">
        <span className="text-lg tabular-nums text-crema-300" aria-hidden>
          {index + 1} / {count}
        </span>
        <div className="flex items-center gap-2" aria-hidden>
          {products.map((p, i) => (
            <span
              key={p.id}
              className={`h-2.5 rounded-full transition-all duration-300 ${i === index ? 'w-8 bg-caramel-400' : 'w-2.5 bg-crema-50/25'}`}
            />
          ))}
        </div>
        <span className="text-lg text-crema-400">
          {effectiveMode === 'gesture'
            ? '✋ Move your open hand left or right'
            : 'Swipe or use the arrows'}
        </span>
      </div>
      <p className="sr-only" aria-live="polite">
        Product {index + 1} of {count}: {current?.name}
      </p>
    </div>
  );
}

function Slide({
  product,
  active,
  money,
  onPick,
}: {
  product: ProductDTO;
  active: boolean;
  money: (n: number) => string;
  onPick: () => void;
}) {
  const unavailable = !product.available;
  return (
    <button
      type="button"
      data-gesture-target
      tabIndex={active ? 0 : -1}
      aria-disabled={(active && unavailable) || undefined}
      aria-label={
        active
          ? `${product.name}, ${money(product.price)}${unavailable ? ', sold out' : ''}`
          : `Show ${product.name}`
      }
      onClick={onPick}
      className="gesture-target glass group flex size-full overflow-hidden rounded-[var(--radius-card)] text-left outline-none portrait:flex-col"
    >
      <div className="relative w-1/2 shrink-0 overflow-hidden portrait:h-1/2 portrait:w-full">
        <ProductImage
          src={product.image}
          alt=""
          className="size-full transition-transform duration-700 group-data-[gesture-hover=true]:scale-105"
        />
        {product.featured ? (
          <span className="absolute left-5 top-5 inline-flex items-center gap-1.5 rounded-full bg-espresso-950/70 px-4 py-2 text-base font-semibold text-caramel-300 backdrop-blur">
            <Star className="size-5 fill-caramel-300" aria-hidden /> Popular
          </span>
        ) : null}
      </div>
      <div className="flex min-w-0 flex-1 flex-col gap-4 p-8">
        <h2 className="text-display text-5xl font-semibold leading-tight text-crema-50">
          {product.name}
        </h2>
        <p className="line-clamp-5 text-2xl leading-snug text-crema-300">{product.description}</p>
        <div className="mt-auto flex flex-wrap items-end justify-between gap-4 pt-4">
          <span className="text-5xl font-semibold tabular-nums text-caramel-300">
            {money(product.price)}
          </span>
          {unavailable ? (
            <span className="rounded-full bg-berry-500/15 px-4 py-2 text-lg font-medium text-berry-300 ring-1 ring-berry-400/30">
              Sold out
            </span>
          ) : (
            <span className="inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-caramel-300 to-caramel-500 px-6 py-3 text-xl font-semibold text-espresso-950 shadow-lg">
              Choose <ChevronRight className="size-6" aria-hidden />
            </span>
          )}
        </div>
      </div>
    </button>
  );
}

function ArrowButton({
  side,
  disabled,
  onClick,
}: {
  side: 'left' | 'right';
  disabled: boolean;
  onClick: () => void;
}) {
  const Icon = side === 'left' ? ChevronLeft : ChevronRight;
  return (
    <button
      type="button"
      data-gesture-target
      disabled={disabled}
      aria-label={side === 'left' ? 'Previous product' : 'Next product'}
      onClick={onClick}
      className={`gesture-target glass absolute top-1/2 z-10 flex size-20 -translate-y-1/2 items-center justify-center rounded-full text-crema-50 shadow-xl outline-none transition-opacity disabled:pointer-events-none disabled:opacity-0 ${
        side === 'left' ? 'left-3' : 'right-3'
      }`}
    >
      <Icon className="size-10" aria-hidden />
    </button>
  );
}
