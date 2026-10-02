import type {
  ApiResponse,
  CategoryDTO,
  CreateOrderInput,
  KioskConfigDTO,
  OrderDTO,
  OrderQuoteDTO,
  PaymentDTO,
  ProductDTO,
  PublicOrderStatusDTO,
} from '@gcs/types';
import { config } from './config';

export class ApiError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly status: number,
  ) {
    super(message);
    this.name = 'ApiError';
  }

  get isNetwork() {
    return this.code === 'NETWORK_ERROR' || this.code === 'TIMEOUT';
  }
}

const TIMEOUT_MS = 10_000;

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  let response: Response;
  try {
    response = await fetch(`${config.apiUrl}/api${path}`, {
      ...init,
      signal: init.signal ?? controller.signal,
      headers: { 'Content-Type': 'application/json', ...init.headers },
      cache: 'no-store',
    });
  } catch (error) {
    if ((error as Error).name === 'AbortError') {
      throw new ApiError(
        'The server is taking too long to respond. Please try again.',
        'TIMEOUT',
        0,
      );
    }
    throw new ApiError(
      "We can't reach the coffee shop system right now. Please try again.",
      'NETWORK_ERROR',
      0,
    );
  } finally {
    clearTimeout(timer);
  }

  let body: ApiResponse<T> | null = null;
  try {
    body = (await response.json()) as ApiResponse<T>;
  } catch {
    body = null;
  }
  if (!body)
    throw new ApiError('Unexpected response from the server.', 'INTERNAL_ERROR', response.status);
  if (!body.success) throw new ApiError(body.error.message, body.error.code, response.status);
  return body.data;
}

export const api = {
  kioskConfig: (code: string) =>
    request<KioskConfigDTO>(`/kiosk/config?code=${encodeURIComponent(code)}`),
  categories: () => request<CategoryDTO[]>('/categories'),
  products: () => request<ProductDTO[]>('/products'),
  product: (id: string) => request<ProductDTO>(`/products/${encodeURIComponent(id)}`),
  /** Server-side price calculation — the source of truth shown before confirming. */
  quote: (input: CreateOrderInput) =>
    request<OrderQuoteDTO>('/orders/quote', { method: 'POST', body: JSON.stringify(input) }),
  createOrder: (input: CreateOrderInput) =>
    request<OrderDTO>('/orders', { method: 'POST', body: JSON.stringify(input) }),
  order: (id: string) => request<OrderDTO>(`/orders/${encodeURIComponent(id)}`),
  orderStatus: (id: string) =>
    request<PublicOrderStatusDTO>(`/orders/${encodeURIComponent(id)}/status`),
  /** QR payment for an unpaid order. */
  payment: (orderId: string) =>
    request<PaymentDTO>(`/orders/${encodeURIComponent(orderId)}/payment`),
  /** Customer pays cash at the counter instead of scanning the QR. */
  payCash: (orderId: string) =>
    request<PaymentDTO>(`/orders/${encodeURIComponent(orderId)}/payment/cash`, { method: 'POST' }),
  /** Cancels an order that has not been paid yet (customer backed out). */
  cancelUnpaid: (orderId: string) =>
    request<PublicOrderStatusDTO>(`/orders/${encodeURIComponent(orderId)}/cancel`, {
      method: 'POST',
    }),
};
