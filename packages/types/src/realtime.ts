import type { OrderDTO, PublicOrderStatusDTO } from './orders';

/** Socket.IO event names shared by backend, kitchen, admin and kiosk. */
export const SOCKET_EVENTS = {
  ORDER_CREATED: 'order:created',
  ORDER_UPDATED: 'order:updated',
  ORDER_STATUS: 'order:status',
  SUBSCRIBE_ORDER: 'order:subscribe',
  UNSUBSCRIBE_ORDER: 'order:unsubscribe',
} as const;

export const SOCKET_ROOMS = {
  KITCHEN: 'kitchen',
  order: (orderId: string) => `order:${orderId}`,
} as const;

export interface ServerToClientEvents {
  'order:created': (order: OrderDTO) => void;
  'order:updated': (order: OrderDTO) => void;
  'order:status': (status: PublicOrderStatusDTO) => void;
}

export interface ClientToServerEvents {
  'order:subscribe': (orderId: string) => void;
  'order:unsubscribe': (orderId: string) => void;
}
