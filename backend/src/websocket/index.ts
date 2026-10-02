import type { Server as HttpServer } from 'node:http';
import { Server } from 'socket.io';
import {
  SOCKET_EVENTS,
  SOCKET_ROOMS,
  type ClientToServerEvents,
  type OrderDTO,
  type PublicOrderStatusDTO,
  type ServerToClientEvents,
} from '@gcs/types';
import { env } from '../config/env';
import { logger } from '../config/logger';
import { prisma } from '../config/prisma';
import { AUTH_COOKIE, readCookie, verifyToken } from '../utils/jwt';

type IO = Server<ClientToServerEvents, ServerToClientEvents>;

let io: IO | null = null;

const ORDER_ID_PATTERN = /^[a-z0-9]{20,40}$/i;

/**
 * Socket.IO rooms:
 *  - "kitchen": authenticated staff/admin receive every order create/update.
 *  - "order:<id>": anyone holding the (unguessable) order id receives its public status.
 */
export function initRealtime(server: HttpServer): IO {
  io = new Server<ClientToServerEvents, ServerToClientEvents>(server, {
    cors: { origin: env.CORS_ORIGINS, credentials: true },
    serveClient: false,
  });

  io.on('connection', async (socket) => {
    const token =
      (typeof socket.handshake.auth?.token === 'string'
        ? socket.handshake.auth.token
        : undefined) ?? readCookie(socket.handshake.headers.cookie, AUTH_COOKIE);
    const payload = verifyToken(token);
    if (payload) {
      const user = await prisma.user
        .findUnique({ where: { id: payload.sub }, select: { active: true, sessionVersion: true } })
        .catch(() => null);
      if (user?.active && user.sessionVersion === payload.ver) {
        await socket.join(SOCKET_ROOMS.KITCHEN);
        logger.debug({ userId: payload.sub }, 'staff socket joined kitchen room');
      }
    }

    socket.on(SOCKET_EVENTS.SUBSCRIBE_ORDER, (orderId) => {
      if (typeof orderId === 'string' && ORDER_ID_PATTERN.test(orderId)) {
        void socket.join(SOCKET_ROOMS.order(orderId));
      }
    });
    socket.on(SOCKET_EVENTS.UNSUBSCRIBE_ORDER, (orderId) => {
      if (typeof orderId === 'string') void socket.leave(SOCKET_ROOMS.order(orderId));
    });
  });

  return io;
}

export function closeRealtime(): Promise<void> {
  return new Promise((resolve) => {
    if (!io) return resolve();
    void io.close(() => resolve());
    io = null;
  });
}

// ---- emitters (no-ops when realtime is not initialised, e.g. in unit tests) ----

export function emitOrderCreated(order: OrderDTO, status: PublicOrderStatusDTO): void {
  io?.to(SOCKET_ROOMS.KITCHEN).emit(SOCKET_EVENTS.ORDER_CREATED, order);
  io?.to(SOCKET_ROOMS.order(order.id)).emit(SOCKET_EVENTS.ORDER_STATUS, status);
}

/** Customer-facing status only (e.g. an unpaid order that never reached the kitchen). */
export function emitPublicStatus(status: PublicOrderStatusDTO): void {
  io?.to(SOCKET_ROOMS.order(status.id)).emit(SOCKET_EVENTS.ORDER_STATUS, status);
}

export function emitOrderUpdated(order: OrderDTO, status: PublicOrderStatusDTO): void {
  io?.to(SOCKET_ROOMS.KITCHEN).emit(SOCKET_EVENTS.ORDER_UPDATED, order);
  io?.to(SOCKET_ROOMS.order(order.id)).emit(SOCKET_EVENTS.ORDER_STATUS, status);
}
