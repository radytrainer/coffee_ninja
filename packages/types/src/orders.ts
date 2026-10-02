export const ORDER_STATUSES = [
  'PENDING_PAYMENT',
  'NEW',
  'ACCEPTED',
  'PREPARING',
  'READY',
  'COMPLETED',
  'CANCELLED',
] as const;

export type OrderStatus = (typeof ORDER_STATUSES)[number];

/** Allowed status transitions. Terminal states have no outgoing transitions. */
export const ORDER_STATUS_TRANSITIONS: Record<OrderStatus, readonly OrderStatus[]> = {
  // Paid (QR payment confirmed, or marked paid by staff) → goes to the kitchen as NEW.
  PENDING_PAYMENT: ['NEW', 'CANCELLED'],
  NEW: ['ACCEPTED', 'PREPARING', 'CANCELLED'],
  ACCEPTED: ['PREPARING', 'CANCELLED'],
  PREPARING: ['READY', 'CANCELLED'],
  READY: ['COMPLETED'],
  COMPLETED: [],
  CANCELLED: [],
};

export function canTransition(from: OrderStatus, to: OrderStatus): boolean {
  return ORDER_STATUS_TRANSITIONS[from].includes(to);
}

export const ACTIVE_ORDER_STATUSES: readonly OrderStatus[] = [
  'NEW',
  'ACCEPTED',
  'PREPARING',
  'READY',
];

/** Customer-facing status message shown on the kiosk. */
export const ORDER_STATUS_MESSAGES: Record<OrderStatus, string> = {
  PENDING_PAYMENT: 'Waiting for payment',
  NEW: 'Order received',
  ACCEPTED: 'Order accepted by our baristas',
  PREPARING: 'Preparing your order...',
  READY: 'Your order is ready for pickup!',
  COMPLETED: 'Order completed. Enjoy!',
  CANCELLED: 'Order cancelled. Please see a staff member.',
};

export interface OrderItemOptionDTO {
  id: string;
  optionId: string | null;
  groupName: string;
  optionName: string;
  priceDelta: number;
}

export interface OrderItemDTO {
  id: string;
  productId: string | null;
  productName: string;
  quantity: number;
  basePrice: number;
  unitPrice: number;
  lineTotal: number;
  notes: string | null;
  options: OrderItemOptionDTO[];
}

export interface OrderStatusHistoryDTO {
  id: string;
  status: OrderStatus;
  note: string | null;
  changedBy: { id: string; name: string } | null;
  createdAt: string;
}

export interface OrderDTO {
  id: string;
  orderNumber: string;
  status: OrderStatus;
  subtotal: number;
  tax: number;
  total: number;
  taxRate: number;
  /** Amount taken off the subtotal (e.g. smile discount); tax is calculated after it. */
  discount: number;
  discountReason: string | null;
  paidAt: string | null;
  /** How the customer pays: `qr` / `cash` while unpaid; `cash`/`manual` = taken by staff. */
  payment: { provider: string; status: PaymentStatus; expiresAt: string } | null;
  kioskId: string | null;
  items: OrderItemDTO[];
  statusHistory?: OrderStatusHistoryDTO[];
  createdAt: string;
  updatedAt: string;
}

/** Public, customer-safe status view used by the kiosk. */
export interface PublicOrderStatusDTO {
  id: string;
  orderNumber: string;
  status: OrderStatus;
  message: string;
  total: number;
  createdAt: string;
  updatedAt: string;
}

/** What the kiosk sends. Prices are intentionally absent: the server calculates them. */
export interface CreateOrderItemInput {
  productId: string;
  quantity: number;
  optionIds: string[];
  notes?: string;
}

export interface CreateOrderInput {
  items: CreateOrderItemInput[];
  kioskCode?: string;
  /** Signed, single-use proof from the kiosk's vision service that the customer smiled. */
  smileToken?: string;
}

export interface OrderQuoteLine {
  productId: string;
  productName: string;
  quantity: number;
  basePrice: number;
  unitPrice: number;
  lineTotal: number;
  options: { optionId: string; groupName: string; optionName: string; priceDelta: number }[];
}

export interface OrderQuoteDTO {
  lines: OrderQuoteLine[];
  subtotal: number;
  discount: number;
  discountReason: string | null;
  /** Smile discount on offer (0 = not available); `smileApplied` when a valid token was sent. */
  smileDiscountRate: number;
  smileApplied: boolean;
  tax: number;
  total: number;
  taxRate: number;
}

export const PAYMENT_STATUSES = ['PENDING', 'PAID', 'EXPIRED', 'CANCELLED'] as const;
export type PaymentStatus = (typeof PAYMENT_STATUSES)[number];

/** QR payment for an order. The kiosk shows `qrSvg` until the payment is confirmed. */
export interface PaymentDTO {
  id: string;
  orderId: string;
  orderNumber: string;
  provider: string;
  status: PaymentStatus;
  amount: number;
  currency: string;
  /** SVG markup of the QR code (only while pending). */
  qrSvg: string | null;
  /** What the QR encodes — a payment link or bank QR string (only while pending). */
  qrPayload: string | null;
  expiresAt: string;
  paidAt: string | null;
}
