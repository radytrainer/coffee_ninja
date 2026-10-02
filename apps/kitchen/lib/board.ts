import type { OrderDTO, OrderStatus } from '@gcs/types';

/** Pure board state for the kitchen display (unit tested). */
export type BoardState = Record<string, OrderDTO>;

export type BoardAction =
  { type: 'load'; orders: OrderDTO[] } | { type: 'upsert'; order: OrderDTO };

const ON_BOARD: readonly OrderStatus[] = ['NEW', 'ACCEPTED', 'PREPARING', 'READY'];

/** Unpaid order whose customer chose to pay cash at the counter. */
export function isAwaitingCash(order: OrderDTO): boolean {
  return (
    order.status === 'PENDING_PAYMENT' &&
    order.payment?.provider === 'cash' &&
    order.payment.status === 'PENDING'
  );
}

/** Paid orders to prepare, plus cash orders waiting at the counter. Unpaid QR orders are never shown. */
function onBoard(order: OrderDTO): boolean {
  return ON_BOARD.includes(order.status) || isAwaitingCash(order);
}

export function boardReducer(state: BoardState, action: BoardAction): BoardState {
  switch (action.type) {
    case 'load':
      return Object.fromEntries(action.orders.filter(onBoard).map((o) => [o.id, o]));
    case 'upsert': {
      const existing = state[action.order.id];
      // Ignore stale events that arrive out of order.
      if (existing && existing.updatedAt > action.order.updatedAt) return state;
      if (!onBoard(action.order)) {
        if (!existing) return state;
        const { [action.order.id]: _removed, ...rest } = state;
        return rest;
      }
      return { ...state, [action.order.id]: action.order };
    }
    default:
      return state;
  }
}

export type ColumnId = 'NEW' | 'PREPARING' | 'READY';

export const COLUMNS: { id: ColumnId; title: string; statuses: OrderStatus[] }[] = [
  { id: 'NEW', title: 'New', statuses: ['NEW'] },
  { id: 'PREPARING', title: 'Preparing', statuses: ['ACCEPTED', 'PREPARING'] },
  { id: 'READY', title: 'Ready', statuses: ['READY'] },
];

/** Oldest first within each column (first in, first out). */
export function groupByColumn(state: BoardState): Record<ColumnId, OrderDTO[]> {
  const result: Record<ColumnId, OrderDTO[]> = { NEW: [], PREPARING: [], READY: [] };
  const sorted = Object.values(state).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  for (const order of sorted) {
    const column = COLUMNS.find((c) => c.statuses.includes(order.status));
    if (column) result[column.id].push(order);
  }
  return result;
}

/** Cash orders waiting at the counter, oldest first. */
export function awaitingCash(state: BoardState): OrderDTO[] {
  return Object.values(state)
    .filter(isAwaitingCash)
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

/** The single next step offered on each card. */
export function nextAction(status: OrderStatus): { label: string; status: OrderStatus } | null {
  switch (status) {
    case 'PENDING_PAYMENT':
      return { label: 'Cash received', status: 'NEW' };
    case 'NEW':
      return { label: 'Accept', status: 'ACCEPTED' };
    case 'ACCEPTED':
      return { label: 'Start', status: 'PREPARING' };
    case 'PREPARING':
      return { label: 'Ready', status: 'READY' };
    case 'READY':
      return { label: 'Complete', status: 'COMPLETED' };
    default:
      return null;
  }
}

export type Urgency = 'fresh' | 'waiting' | 'late';

/** Colour-codes how long an order has been waiting. */
export function urgency(
  createdAt: string,
  now: number,
  warnMinutes = 5,
  lateMinutes = 10,
): Urgency {
  const minutes = (now - new Date(createdAt).getTime()) / 60_000;
  if (minutes >= lateMinutes) return 'late';
  if (minutes >= warnMinutes) return 'waiting';
  return 'fresh';
}

export function elapsedLabel(createdAt: string, now: number): string {
  const seconds = Math.max(0, Math.floor((now - new Date(createdAt).getTime()) / 1000));
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return m >= 60 ? `${Math.floor(m / 60)}h ${m % 60}m` : `${m}:${String(s).padStart(2, '0')}`;
}
