export type ApiErrorCode =
  | 'VALIDATION_ERROR'
  | 'UNAUTHORIZED'
  | 'FORBIDDEN'
  | 'NOT_FOUND'
  | 'CONFLICT'
  | 'INVALID_STATUS_TRANSITION'
  | 'PRODUCT_UNAVAILABLE'
  | 'INVALID_OPTIONS'
  | 'SMILE_DISCOUNT_INVALID'
  | 'PAYMENT_EXPIRED'
  | 'RATE_LIMITED'
  | 'INTERNAL_ERROR';

export interface ApiErrorBody {
  success: false;
  error: {
    code: ApiErrorCode;
    message: string;
    details?: { path: string; message: string }[];
  };
}

export interface ApiSuccessBody<T> {
  success: true;
  data: T;
}

export type ApiResponse<T> = ApiSuccessBody<T> | ApiErrorBody;

export interface Paginated<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

export interface DashboardStatsDTO {
  todayOrders: number;
  todayRevenue: number;
  pending: number;
  accepted: number;
  preparing: number;
  ready: number;
  completed: number;
  cancelled: number;
}

export interface SalesReportRow {
  date: string;
  orders: number;
  revenue: number;
}

export interface ProductReportRow {
  productId: string | null;
  productName: string;
  quantity: number;
  revenue: number;
}

export interface CategoryReportRow {
  categoryId: string | null;
  categoryName: string;
  orders: number;
  quantity: number;
  revenue: number;
}

export interface OrdersReportDTO {
  byStatus: { status: string; count: number }[];
  byCategory: CategoryReportRow[];
  averageOrderValue: number;
  totalOrders: number;
}
