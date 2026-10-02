'use client';

import {
  SOCKET_EVENTS,
  type ClientToServerEvents,
  type PublicOrderStatusDTO,
  type ServerToClientEvents,
} from '@gcs/types';
import { useEffect, useState } from 'react';
import { io, type Socket } from 'socket.io-client';
import { api } from '@/lib/api';
import { config } from '@/lib/config';

/**
 * Live order status for the customer: pushed over Socket.IO, with a periodic
 * REST poll as a fallback if the realtime connection drops.
 */
export function useOrderStatus(orderId: string | undefined) {
  const [status, setStatus] = useState<PublicOrderStatusDTO | null>(null);
  const [live, setLive] = useState(false);

  useEffect(() => {
    if (!orderId) return;
    let cancelled = false;
    const socket: Socket<ServerToClientEvents, ClientToServerEvents> = io(config.apiUrl, {
      transports: ['websocket', 'polling'],
      reconnectionDelayMax: 5000,
    });
    socket.on('connect', () => {
      setLive(true);
      socket.emit(SOCKET_EVENTS.SUBSCRIBE_ORDER, orderId);
    });
    socket.on('disconnect', () => setLive(false));
    socket.on(SOCKET_EVENTS.ORDER_STATUS, (update) => {
      if (update.id === orderId) setStatus(update);
    });

    const poll = async () => {
      try {
        const latest = await api.orderStatus(orderId);
        if (!cancelled) setStatus(latest);
      } catch {
        /* keep last known status */
      }
    };
    void poll();
    const timer = window.setInterval(poll, 10_000);

    return () => {
      cancelled = true;
      window.clearInterval(timer);
      socket.emit(SOCKET_EVENTS.UNSUBSCRIBE_ORDER, orderId);
      socket.disconnect();
    };
  }, [orderId]);

  return { status, live };
}
