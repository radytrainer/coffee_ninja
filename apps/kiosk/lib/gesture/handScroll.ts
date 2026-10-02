/**
 * ✌️ Hand scrolling: while the two-finger pose is held, the scroll area under the
 * cursor follows the hand vertically ("drag" semantics, like a touchscreen) and
 * glides to a stop with inertia when the pose is released.
 *
 * Smoothness: the camera delivers 15–30 updates/s, the screen 60+. The scroller
 * keeps a *target* position (moved by hand events) and a *rendered* position that
 * eases toward it every animation frame, time-based so it's independent of frame
 * rate. It tracks its own fractional position because browsers round scrollTop to
 * whole pixels — writing tiny steps directly would lose slow movements.
 */

/** How much the content moves per unit of hand movement (1 = 1:1 with the screen). */
export const SCROLL_GAIN = 2.2;
/** Time constant (ms) of the easing toward the hand target — lower = snappier. */
const FOLLOW_MS = 70;
/** Inertia decay time constant (ms) after release. */
const GLIDE_DECAY_MS = 325;
/** Velocity window (ms) used to estimate release speed. */
const VELOCITY_WINDOW_MS = 120;
const MIN_GLIDE_SPEED = 0.02; // px/ms

/** Hand moved up (dy < 0) → content moves up → scrollTop increases. */
export function scrollDelta(
  dyNormalized: number,
  viewportHeight: number,
  gain = SCROLL_GAIN,
): number {
  return -dyNormalized * viewportHeight * gain;
}

/** Fraction of the remaining distance to cover in `dtMs` (exponential ease, frame-rate independent). */
export function easeFactor(dtMs: number, timeConstantMs = FOLLOW_MS): number {
  return 1 - Math.exp(-Math.max(0, dtMs) / timeConstantMs);
}

/** Total distance an inertial glide travels for a release velocity (px/ms). */
export function glideDistance(velocityPxPerMs: number, decayMs = GLIDE_DECAY_MS): number {
  return Math.abs(velocityPxPerMs) < MIN_GLIDE_SPEED ? 0 : velocityPxPerMs * decayMs;
}

/** Release velocity (px/ms) from recent (time, position) samples. */
export function releaseVelocity(
  samples: { t: number; y: number }[],
  now: number,
  windowMs = VELOCITY_WINDOW_MS,
): number {
  const recent = samples.filter((s) => now - s.t <= windowMs);
  if (recent.length < 2) return 0;
  const first = recent[0]!;
  const last = recent[recent.length - 1]!;
  const dt = last.t - first.t;
  return dt > 0 ? (last.y - first.y) / dt : 0;
}

export function isScrollable(el: Element): el is HTMLElement {
  if (!(el instanceof HTMLElement)) return false;
  const style = getComputedStyle(el);
  return /(auto|scroll)/.test(style.overflowY) && el.scrollHeight > el.clientHeight + 2;
}

/**
 * The scrollable area under the point; otherwise the largest scrollable area on
 * screen (e.g. the product grid), so a ✌️ anywhere still scrolls the main list.
 */
export function findScrollContainer(x: number, y: number): HTMLElement | null {
  for (let el: Element | null = document.elementFromPoint(x, y); el; el = el.parentElement) {
    if (isScrollable(el)) return el;
  }
  const candidates = Array.from(document.querySelectorAll('[data-scroll-area]')).filter(
    isScrollable,
  );
  candidates.sort((a, b) => b.clientHeight * b.clientWidth - a.clientHeight * a.clientWidth);
  return (
    candidates[0] ??
    (isScrollable(document.scrollingElement ?? document.body)
      ? (document.scrollingElement as HTMLElement)
      : null)
  );
}

export class HandScroller {
  private el: HTMLElement | null = null;
  private pos = 0; // rendered (fractional) scroll position
  private target = 0; // where the hand wants the content to be
  private max = 0;
  private samples: { t: number; y: number }[] = [];
  private glideVelocity = 0; // px/ms while gliding
  private gliding = false;
  private frame: number | null = null;
  private lastFrame = 0;

  get active() {
    return this.el !== null && !this.gliding;
  }

  start(el: HTMLElement | null) {
    this.stop();
    if (!el) return;
    this.el = el;
    this.pos = this.target = el.scrollTop;
    this.max = Math.max(0, el.scrollHeight - el.clientHeight);
    this.samples = [{ t: performance.now(), y: this.target }];
  }

  move(dyNormalized: number) {
    if (!this.el) return;
    this.gliding = false;
    this.target = this.clamp(this.target + scrollDelta(dyNormalized, window.innerHeight));
    const now = performance.now();
    this.samples.push({ t: now, y: this.target });
    this.samples = this.samples.filter((s) => now - s.t <= VELOCITY_WINDOW_MS * 2);
    this.loop();
  }

  /** Release: continue with the hand's recent velocity, decaying smoothly. */
  end() {
    if (!this.el) return;
    this.glideVelocity = releaseVelocity(this.samples, performance.now());
    this.gliding = Math.abs(this.glideVelocity) >= MIN_GLIDE_SPEED;
    this.loop();
  }

  stop() {
    if (this.frame !== null) cancelAnimationFrame(this.frame);
    this.frame = null;
    this.el = null;
    this.gliding = false;
    this.glideVelocity = 0;
    this.samples = [];
  }

  private clamp(v: number) {
    return Math.min(this.max, Math.max(0, v));
  }

  private loop() {
    if (this.frame !== null) return;
    this.lastFrame = performance.now();
    const tick = (now: number) => {
      this.frame = null;
      const el = this.el;
      if (!el) return;
      const dt = Math.min(64, now - this.lastFrame); // cap after tab switches
      this.lastFrame = now;

      if (this.gliding) {
        this.target = this.clamp(this.target + this.glideVelocity * dt);
        this.glideVelocity *= Math.exp(-dt / GLIDE_DECAY_MS);
        if (
          Math.abs(this.glideVelocity) < MIN_GLIDE_SPEED ||
          this.target === 0 ||
          this.target === this.max
        ) {
          this.gliding = false;
        }
      }

      this.pos += (this.target - this.pos) * easeFactor(dt);
      el.scrollTop = this.pos;

      const settled = !this.gliding && Math.abs(this.target - this.pos) < 0.25;
      if (settled) {
        this.pos = this.target;
        el.scrollTop = this.pos;
        return; // idle until the next hand movement
      }
      this.frame = requestAnimationFrame(tick);
    };
    this.frame = requestAnimationFrame(tick);
  }
}
