/**
 * Gesture safety rules (pure, framework-free, unit tested):
 *  - Entering a button never clicks it; it only highlights (hover).
 *  - A pinch activates a target only after the cursor rested on it for `hoverDelayMs`.
 *  - After an activation, further pinches are ignored for `cooldownMs`.
 */
export type ActivationDecision =
  'activate' | 'no-target' | 'disabled' | 'hover-too-short' | 'cooldown';

export interface SelectionControllerOptions {
  hoverDelayMs: number;
  cooldownMs: number;
}

export class SelectionController<T = unknown> {
  private target: T | null = null;
  private hoverSince = 0;
  private cooldownUntil = 0;

  constructor(private options: SelectionControllerOptions) {}

  configure(options: Partial<SelectionControllerOptions>) {
    this.options = { ...this.options, ...options };
  }

  /** Call on every cursor update. Returns true when the hovered target changed. */
  hover(target: T | null, now: number): boolean {
    if (target === this.target) return false;
    this.target = target;
    this.hoverSince = now;
    return true;
  }

  get current(): T | null {
    return this.target;
  }

  /** Has the cursor rested long enough on the current target to allow a pinch? */
  isArmed(now: number): boolean {
    return (
      this.target !== null &&
      now - this.hoverSince >= this.options.hoverDelayMs &&
      !this.inCooldown(now)
    );
  }

  hoverProgress(now: number): number {
    if (this.target === null || this.options.hoverDelayMs <= 0) return this.target ? 1 : 0;
    return Math.min(1, (now - this.hoverSince) / this.options.hoverDelayMs);
  }

  inCooldown(now: number): boolean {
    return now < this.cooldownUntil;
  }

  decide(target: T | null, now: number, disabled = false): ActivationDecision {
    if (this.inCooldown(now)) return 'cooldown';
    if (target === null) return 'no-target';
    if (disabled) return 'disabled';
    // A pinch on something other than the hovered button never touches the hover
    // timer of the button the customer is actually resting on.
    if (target !== this.target) return 'hover-too-short';
    if (now - this.hoverSince < this.options.hoverDelayMs) return 'hover-too-short';
    return 'activate';
  }

  markActivated(now: number) {
    this.cooldownUntil = now + this.options.cooldownMs;
  }

  reset() {
    this.target = null;
    this.hoverSince = 0;
  }
}
