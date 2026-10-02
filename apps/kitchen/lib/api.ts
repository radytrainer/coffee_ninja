import type {
  ApiResponse,
  KioskConfigDTO,
  LoginResponseDTO,
  OrderDTO,
  OrderStatus,
  Paginated,
  UserDTO,
} from '@gcs/types';

export const API_URL = (process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000').replace(
  /\/$/,
  '',
);

export class ApiError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly status: number,
  ) {
    super(message);
  }
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${API_URL}/api${path}`, {
      ...init,
      // Session cookie (httpOnly) is sent with every request.
      credentials: 'include',
      headers: { 'Content-Type': 'application/json', ...init.headers },
      cache: 'no-store',
    });
  } catch {
    throw new ApiError(
      'Cannot reach the server. Check the network connection.',
      'NETWORK_ERROR',
      0,
    );
  }
  const body = (await res.json().catch(() => null)) as ApiResponse<T> | null;
  if (!body) throw new ApiError('Unexpected server response', 'INTERNAL_ERROR', res.status);
  if (!body.success) throw new ApiError(body.error.message, body.error.code, res.status);
  return body.data;
}

export const api = {
  login: (email: string, password: string) =>
    request<LoginResponseDTO>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    }),
  logout: () => request<{ loggedOut: boolean }>('/auth/logout', { method: 'POST' }),
  me: () => request<UserDTO>('/auth/me'),
  /** Shop settings (currency for amounts due at the counter). */
  shop: () => request<KioskConfigDTO>('/kiosk/config').then((c) => c.shop),
  activeOrders: () =>
    // PENDING_PAYMENT: the board shows only those paying cash at the counter.
    request<Paginated<OrderDTO>>(
      '/orders?status=PENDING_PAYMENT,NEW,ACCEPTED,PREPARING,READY&pageSize=200',
    ),
  setStatus: (id: string, status: OrderStatus, note?: string) =>
    request<OrderDTO>(`/orders/${encodeURIComponent(id)}/status`, {
      method: 'PATCH',
      body: JSON.stringify({ status, ...(note ? { note } : {}) }),
    }),
};
