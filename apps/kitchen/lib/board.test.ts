import type { OrderDTO, OrderStatus } from '@gcs/types';
import { describe, expect, it } from 'vitest';
import {
  awaitingCash,
  boardReducer,
  elapsedLabel,
  groupByColumn,
  nextAction,
  urgency,
} from './board';

const order = (
  id: string,
  status: OrderStatus,
  createdAt = '2026-01-01T10:00:00.000Z',
  updatedAt = createdAt,
): OrderDTO => ({
  id,
  orderNumber: `A${id}`,
  status,
  subtotal: 1,
  discount: 0,
  discountReason: null,
  paidAt: null,
  payment: null,
  tax: 0.1,
  total: 1.1,
  taxRate: 0.1,
  kioskId: null,
  items: [],
  createdAt,
  updatedAt,
});

describe('kitchen board', () => {
  it('loads only active orders', () => {
    const state = boardReducer(
      {},
      { type: 'load', orders: [order('1', 'NEW'), order('2', 'COMPLETED'), order('3', 'READY')] },
    );
    expect(Object.keys(state).sort()).toEqual(['1', '3']);
  });

  it('adds new orders and moves them between columns in real time', () => {
    let state = boardReducer({}, { type: 'upsert', order: order('1', 'NEW') });
    expect(groupByColumn(state).NEW.map((o) => o.id)).toEqual(['1']);
    state = boardReducer(state, {
      type: 'upsert',
      order: order('1', 'ACCEPTED', undefined, '2026-01-01T10:01:00.000Z'),
    });
    expect(groupByColumn(state).PREPARING.map((o) => o.id)).toEqual(['1']);
    state = boardReducer(state, {
      type: 'upsert',
      order: order('1', 'READY', undefined, '2026-01-01T10:05:00.000Z'),
    });
    expect(groupByColumn(state).READY.map((o) => o.id)).toEqual(['1']);
    state = boardReducer(state, {
      type: 'upsert',
      order: order('1', 'COMPLETED', undefined, '2026-01-01T10:06:00.000Z'),
    });
    expect(state).toEqual({});
  });

  it('ignores stale out-of-order updates', () => {
    let state = boardReducer(
      {},
      { type: 'upsert', order: order('1', 'READY', undefined, '2026-01-01T10:05:00.000Z') },
    );
    state = boardReducer(state, {
      type: 'upsert',
      order: order('1', 'NEW', undefined, '2026-01-01T10:00:00.000Z'),
    });
    expect(state['1']!.status).toBe('READY');
  });

  it('sorts oldest first', () => {
    const state = boardReducer(
      {},
      {
        type: 'load',
        orders: [
          order('b', 'NEW', '2026-01-01T10:05:00.000Z'),
          order('a', 'NEW', '2026-01-01T10:00:00.000Z'),
        ],
      },
    );
    expect(groupByColumn(state).NEW.map((o) => o.id)).toEqual(['a', 'b']);
  });

  it('offers the correct next action', () => {
    expect(nextAction('NEW')?.status).toBe('ACCEPTED');
    expect(nextAction('ACCEPTED')?.status).toBe('PREPARING');
    expect(nextAction('PREPARING')?.status).toBe('READY');
    expect(nextAction('READY')?.status).toBe('COMPLETED');
    expect(nextAction('COMPLETED')).toBeNull();
  });

  it('computes urgency and elapsed time', () => {
    const t0 = Date.parse('2026-01-01T10:00:00.000Z');
    expect(urgency('2026-01-01T10:00:00.000Z', t0 + 2 * 60_000)).toBe('fresh');
    expect(urgency('2026-01-01T10:00:00.000Z', t0 + 6 * 60_000)).toBe('waiting');
    expect(urgency('2026-01-01T10:00:00.000Z', t0 + 11 * 60_000)).toBe('late');
    expect(elapsedLabel('2026-01-01T10:00:00.000Z', t0 + 125_000)).toBe('2:05');
  });
});

describe('cash at the counter', () => {
  const unpaid = (id: string, provider: string) => ({
    ...order(id, 'PENDING_PAYMENT'),
    payment: { provider, status: 'PENDING' as const, expiresAt: '2026-01-01T10:15:00.000Z' },
  });

  it('shows unpaid cash orders in their own queue, never unpaid QR orders', () => {
    const state = boardReducer(
      {},
      { type: 'load', orders: [unpaid('1', 'cash'), unpaid('2', 'demo'), order('3', 'NEW')] },
    );
    expect(Object.keys(state).sort()).toEqual(['1', '3']);
    expect(awaitingCash(state).map((o) => o.id)).toEqual(['1']);
    expect(groupByColumn(state).NEW.map((o) => o.id)).toEqual(['3']); // not in the make queue yet
  });

  it('moves to New once the cash is received, and disappears when voided', () => {
    let state = boardReducer({}, { type: 'upsert', order: unpaid('1', 'cash') });
    expect(nextAction('PENDING_PAYMENT')).toEqual({ label: 'Cash received', status: 'NEW' });
    state = boardReducer(state, {
      type: 'upsert',
      order: order('1', 'NEW', undefined, '2026-01-01T10:01:00.000Z'),
    });
    expect(awaitingCash(state)).toEqual([]);
    expect(groupByColumn(state).NEW.map((o) => o.id)).toEqual(['1']);

    state = boardReducer({}, { type: 'upsert', order: unpaid('2', 'cash') });
    state = boardReducer(state, {
      type: 'upsert',
      order: order('2', 'CANCELLED', undefined, '2026-01-01T10:20:00.000Z'),
    });
    expect(state).toEqual({});
  });
});
