import { act, fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { QuantityStepper } from '@/components/ui/QuantityStepper';
import { GESTURE_PRESS_END, GESTURE_PRESS_START, HoldToConfirm } from './HoldToConfirm';
import { StatusTracker } from './StatusTracker';

const wait = (ms: number) => act(() => new Promise((r) => setTimeout(r, ms)));

describe('HoldToConfirm (deliberate order confirmation)', () => {
  it('does not confirm on a simple click', async () => {
    const onConfirm = vi.fn();
    render(
      <HoldToConfirm holdMs={80} onConfirm={onConfirm}>
        Place order
      </HoldToConfirm>,
    );
    fireEvent.click(screen.getByRole('button', { name: /Place order/ }));
    await wait(150);
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it('confirms after a gesture press is held long enough', async () => {
    const onConfirm = vi.fn();
    render(
      <HoldToConfirm holdMs={80} onConfirm={onConfirm}>
        Place order
      </HoldToConfirm>,
    );
    const button = screen.getByRole('button', { name: /Place order/ });
    act(() => void button.dispatchEvent(new Event(GESTURE_PRESS_START)));
    await wait(200);
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it('cancels if released early', async () => {
    const onConfirm = vi.fn();
    render(
      <HoldToConfirm holdMs={300} onConfirm={onConfirm}>
        Place order
      </HoldToConfirm>,
    );
    const button = screen.getByRole('button', { name: /Place order/ });
    act(() => void button.dispatchEvent(new Event(GESTURE_PRESS_START)));
    await wait(60);
    act(() => void button.dispatchEvent(new Event(GESTURE_PRESS_END)));
    await wait(350);
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it('supports the keyboard (hold Enter)', async () => {
    const onConfirm = vi.fn();
    render(
      <HoldToConfirm holdMs={80} onConfirm={onConfirm}>
        Place order
      </HoldToConfirm>,
    );
    const button = screen.getByRole('button', { name: /Place order/ });
    fireEvent.keyDown(button, { key: 'Enter' });
    await wait(200);
    fireEvent.keyUp(button, { key: 'Enter' });
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it('is a gesture hold target (not a single-pinch target)', () => {
    render(
      <HoldToConfirm holdMs={80} onConfirm={() => undefined}>
        Place order
      </HoldToConfirm>,
    );
    const button = screen.getByRole('button', { name: /Place order/ });
    expect(button).toHaveAttribute('data-gesture-target');
    expect(button).toHaveAttribute('data-gesture-hold');
  });
});

describe('QuantityStepper', () => {
  it('increments, decrements and disables at the bounds', () => {
    const inc = vi.fn();
    const dec = vi.fn();
    const { rerender } = render(<QuantityStepper value={1} onIncrement={inc} onDecrement={dec} />);
    expect(screen.getByRole('button', { name: 'Decrease quantity' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Increase quantity' }));
    expect(inc).toHaveBeenCalled();
    rerender(<QuantityStepper value={20} onIncrement={inc} onDecrement={dec} />);
    expect(screen.getByRole('button', { name: 'Increase quantity' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Decrease quantity' }));
    expect(dec).toHaveBeenCalled();
  });
});

describe('StatusTracker', () => {
  it('marks the current step', () => {
    render(<StatusTracker status="PREPARING" />);
    const current = screen.getByText('Preparing').closest('li');
    expect(current).toHaveAttribute('aria-current', 'step');
  });

  it('shows a clear message for cancelled orders', () => {
    render(<StatusTracker status="CANCELLED" />);
    expect(screen.getByText(/cancelled/i)).toBeInTheDocument();
  });
});
