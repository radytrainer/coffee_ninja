'use client';

import {
  SOCKET_EVENTS,
  type ClientToServerEvents,
  type OrderDTO,
  type OrderStatus,
  type ServerToClientEvents,
  type UserDTO,
} from '@gcs/types';
import {
  Banknote,
  BellRing,
  ChefHat,
  Coffee,
  LogOut,
  Maximize,
  Volume2,
  VolumeX,
  Wifi,
  WifiOff,
} from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import { io, type Socket } from 'socket.io-client';
import { CashCard } from '@/components/CashCard';
import { OrderCard } from '@/components/OrderCard';
import { api, API_URL, ApiError } from '@/lib/api';
import { awaitingCash, boardReducer, COLUMNS, groupByColumn, type ColumnId } from '@/lib/board';
import { chime } from '@/lib/sound';

const columnAccent = {
  NEW: 'bg-caramel-400',
  PREPARING: 'bg-sky-400',
  READY: 'bg-mint-400',
} as const;

export default function KitchenBoard() {
  const router = useRouter();
  const [user, setUser] = useState<UserDTO | null>(null);
  const [board, dispatch] = useReducer(boardReducer, {});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [live, setLive] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const [fresh, setFresh] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState<Set<string>>(new Set());
  const [soundOn, setSoundOn] = useState(true);
  /** Column shown on phones/tablets (all three are shown side by side from 1024px). */
  const [activeColumn, setActiveColumn] = useState<ColumnId>('NEW');
  const soundRef = useRef(soundOn);
  useEffect(() => {
    soundRef.current = soundOn;
  }, [soundOn]);

  const load = useCallback(async () => {
    try {
      const data = await api.activeOrders();
      dispatch({ type: 'load', orders: data.items });
      setError(null);
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) router.replace('/login');
      else setError(e instanceof ApiError ? e.message : 'Could not load orders');
    } finally {
      setLoading(false);
    }
  }, [router]);

  // Authenticate, then load orders and subscribe to real-time updates.
  useEffect(() => {
    let socket: Socket<ServerToClientEvents, ClientToServerEvents> | null = null;
    let cancelled = false;
    api
      .me()
      .then((me) => {
        if (cancelled) return;
        setUser(me);
        void load();
        socket = io(API_URL, { withCredentials: true, transports: ['websocket', 'polling'] });
        socket.on('connect', () => {
          setLive(true);
          void load(); // resync anything missed while disconnected
        });
        socket.on('disconnect', () => setLive(false));
        socket.on(SOCKET_EVENTS.ORDER_CREATED, (order: OrderDTO) => {
          dispatch({ type: 'upsert', order });
          setFresh((s) => new Set(s).add(order.id));
          window.setTimeout(
            () =>
              setFresh((s) => {
                const next = new Set(s);
                next.delete(order.id);
                return next;
              }),
            8000,
          );
          if (soundRef.current) chime();
        });
        socket.on(SOCKET_EVENTS.ORDER_UPDATED, (order: OrderDTO) =>
          dispatch({ type: 'upsert', order }),
        );
      })
      .catch(() => router.replace('/login'));
    return () => {
      cancelled = true;
      socket?.disconnect();
    };
  }, [load, router]);

  useEffect(() => {
    const t = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(t);
  }, []);

  const columns = useMemo(() => groupByColumn(board), [board]);
  const cashQueue = useMemo(() => awaitingCash(board), [board]);
  const [currency, setCurrency] = useState('USD');
  useEffect(() => {
    api
      .shop()
      .then((shop) => setCurrency(shop.currency))
      .catch(() => undefined);
  }, []);
  const money = useMemo(() => {
    const fmt = new Intl.NumberFormat('en-US', { style: 'currency', currency });
    return (value: number) => fmt.format(value);
  }, [currency]);
  const newCount = columns.NEW.length;
  useEffect(() => {
    document.title =
      newCount > 0 ? `(${newCount}) New orders — Kitchen` : 'Kitchen Display — PNC Coffee';
  }, [newCount]);

  const changeStatus = async (order: OrderDTO, status: OrderStatus) => {
    setBusy((s) => new Set(s).add(order.id));
    try {
      const updated = await api.setStatus(order.id, status);
      dispatch({ type: 'upsert', order: updated });
      setError(null);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not update the order');
      if (e instanceof ApiError && e.status === 401) router.replace('/login');
      else void load();
    } finally {
      setBusy((s) => {
        const next = new Set(s);
        next.delete(order.id);
        return next;
      });
    }
  };

  const logout = async () => {
    await api.logout().catch(() => undefined);
    router.replace('/login');
  };

  return (
    <div className="flex h-full flex-col">
      <header className="flex flex-wrap items-center gap-2 border-b border-crema-50/10 px-3 py-3 sm:gap-4 sm:px-6 sm:py-4">
        <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-caramel-400 text-espresso-950 sm:size-12">
          <ChefHat className="size-7" aria-hidden />
        </div>
        <div className="mr-auto min-w-0">
          <h1 className="truncate font-display text-xl text-crema-50 sm:text-2xl">
            Kitchen<span className="hidden sm:inline"> Display</span>
          </h1>
          <p className="hidden truncate text-sm text-crema-400 sm:block">
            {user ? `Signed in as ${user.name}` : 'Connecting…'}
          </p>
        </div>
        <span
          className={`inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-sm font-medium ${
            live ? 'bg-mint-500/15 text-mint-300' : 'bg-berry-500/15 text-berry-300'
          }`}
          role="status"
        >
          {live ? (
            <Wifi className="size-4" aria-hidden />
          ) : (
            <WifiOff className="size-4" aria-hidden />
          )}
          {live ? 'Live' : 'Reconnecting…'}
        </span>
        <button
          type="button"
          onClick={() => {
            setSoundOn((v) => !v);
            if (!soundOn) chime();
          }}
          className="kbtn bg-crema-50/5 px-3 text-crema-200 hover:bg-crema-50/10"
          aria-label={soundOn ? 'Mute new-order sound' : 'Enable new-order sound'}
        >
          {soundOn ? (
            <Volume2 className="size-5" aria-hidden />
          ) : (
            <VolumeX className="size-5" aria-hidden />
          )}
        </button>
        <button
          type="button"
          onClick={() => void document.documentElement.requestFullscreen?.().catch(() => undefined)}
          className="kbtn hidden bg-crema-50/5 px-3 text-crema-200 hover:bg-crema-50/10 sm:inline-flex"
          aria-label="Full screen"
        >
          <Maximize className="size-5" aria-hidden />
        </button>
        <button
          type="button"
          onClick={() => void logout()}
          aria-label="Sign out"
          className="kbtn bg-crema-50/5 text-crema-200 hover:bg-crema-50/10"
        >
          <LogOut className="size-5" aria-hidden />
          <span className="hidden sm:inline">Sign out</span>
        </button>
      </header>

      {error ? (
        <p className="mx-6 mt-4 rounded-xl bg-berry-500/15 px-4 py-3 text-berry-300" role="alert">
          {error}
        </p>
      ) : null}

      {cashQueue.length > 0 ? (
        <section
          className="mx-3 mt-3 rounded-3xl bg-caramel-500/10 p-3 ring-1 ring-caramel-400/30 sm:mx-5 sm:mt-4"
          aria-labelledby="cash-queue"
        >
          <h2
            id="cash-queue"
            className="mb-3 flex items-center gap-2 px-2 text-lg font-bold uppercase tracking-[0.15em] text-caramel-200"
          >
            <Banknote className="size-6" aria-hidden /> Awaiting cash payment
            <span className="rounded-full bg-crema-50/10 px-3 py-0.5 tabular-nums">
              {cashQueue.length}
            </span>
            <span className="ml-auto hidden text-sm font-normal normal-case tracking-normal text-crema-400 sm:inline">
              Take the money, then press Cash received — the order moves to New.
            </span>
          </h2>
          <div className="flex gap-3 overflow-x-auto pb-1">
            {cashQueue.map((order) => (
              <CashCard
                key={order.id}
                order={order}
                now={now}
                busy={busy.has(order.id)}
                money={money}
                onStatus={(o, s) => void changeStatus(o, s)}
              />
            ))}
          </div>
        </section>
      ) : null}

      {/* Column switcher for narrow screens */}
      <nav className="grid grid-cols-3 gap-2 px-3 pt-3 lg:hidden" aria-label="Order columns">
        {COLUMNS.map((column) => (
          <button
            key={column.id}
            type="button"
            aria-pressed={activeColumn === column.id}
            onClick={() => setActiveColumn(column.id)}
            className={`kbtn relative gap-1.5 px-1.5 py-2.5 text-xs uppercase tracking-wide sm:gap-2 sm:text-sm sm:tracking-wider ${
              activeColumn === column.id
                ? 'bg-crema-50/15 text-crema-50'
                : 'bg-crema-50/5 text-crema-300'
            }`}
          >
            <span
              className={`hidden size-2.5 rounded-full sm:inline-block ${columnAccent[column.id]}`}
            />
            {column.title}
            <span className="rounded-full bg-crema-50/10 px-2 tabular-nums">
              {columns[column.id].length}
            </span>
            {column.id === 'NEW' && newCount > 0 && activeColumn !== 'NEW' ? (
              <span className="absolute -right-1 -top-1 size-3 animate-ping rounded-full bg-caramel-400" />
            ) : null}
          </button>
        ))}
      </nav>

      <main className="grid min-h-0 flex-1 gap-4 p-3 sm:p-5 lg:grid-cols-3 lg:gap-5">
        {COLUMNS.map((column) => {
          const orders = columns[column.id];
          return (
            <section
              key={column.id}
              className={`panel min-h-0 flex-col rounded-3xl lg:flex ${activeColumn === column.id ? 'flex' : 'hidden'}`}
              aria-labelledby={`col-${column.id}`}
            >
              <header className="flex items-center gap-3 px-5 pb-3 pt-5">
                <span className={`size-3 rounded-full ${columnAccent[column.id]}`} />
                <h2
                  id={`col-${column.id}`}
                  className="text-lg font-bold uppercase tracking-[0.15em] text-crema-100 xl:text-xl xl:tracking-[0.2em]"
                >
                  {column.title}
                </h2>
                <span className="ml-auto rounded-full bg-crema-50/10 px-3 py-0.5 text-lg font-semibold tabular-nums">
                  {orders.length}
                </span>
              </header>
              <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-4 pb-4">
                {loading ? (
                  <div className="card h-40 animate-pulse rounded-2xl" />
                ) : orders.length === 0 ? (
                  <div className="flex flex-1 flex-col items-center justify-center gap-2 text-crema-400">
                    {column.id === 'NEW' ? (
                      <BellRing className="size-10" aria-hidden />
                    ) : (
                      <Coffee className="size-10" aria-hidden />
                    )}
                    <p>{column.id === 'NEW' ? 'Waiting for new orders' : 'Nothing here'}</p>
                  </div>
                ) : (
                  orders.map((order) => (
                    <OrderCard
                      key={order.id}
                      order={order}
                      now={now}
                      fresh={fresh.has(order.id)}
                      busy={busy.has(order.id)}
                      onStatus={(o, s) => void changeStatus(o, s)}
                    />
                  ))
                )}
              </div>
            </section>
          );
        })}
      </main>
    </div>
  );
}
