export type SelectionType = 'SINGLE' | 'MULTIPLE';

export interface CategoryDTO {
  id: string;
  name: string;
  description: string | null;
  image: string | null;
  sortOrder: number;
  active: boolean;
  productCount?: number;
  createdAt: string;
  updatedAt: string;
}

export interface ProductOptionDTO {
  id: string;
  groupId: string;
  name: string;
  priceDelta: number;
  isDefault: boolean;
  available: boolean;
  sortOrder: number;
}

export interface ProductOptionGroupDTO {
  id: string;
  name: string;
  description: string | null;
  selectionType: SelectionType;
  required: boolean;
  minSelect: number;
  maxSelect: number;
  sortOrder: number;
  options: ProductOptionDTO[];
  productCount?: number;
}

export interface ProductDTO {
  id: string;
  name: string;
  description: string | null;
  price: number;
  image: string | null;
  categoryId: string;
  category?: { id: string; name: string };
  available: boolean;
  featured: boolean;
  sortOrder: number;
  optionGroups: ProductOptionGroupDTO[];
  createdAt: string;
  updatedAt: string;
}

export interface InventoryItemDTO {
  id: string;
  name: string;
  unit: string;
  quantity: number;
  lowStockThreshold: number;
  lowStock: boolean;
  productId: string | null;
  product?: { id: string; name: string } | null;
  createdAt: string;
  updatedAt: string;
}

export interface KioskDTO {
  id: string;
  code: string;
  name: string;
  location: string | null;
  active: boolean;
  inputMode: 'GESTURE' | 'MOUSE';
  sessionTimeoutSeconds: number;
  successResetSeconds: number;
  hoverDelayMs: number;
  lastSeenAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ShopSettingsDTO {
  shopName: string;
  currency: string;
  taxRate: number;
  orderNumberPrefix: string;
  /** IANA timezone used for "today" and daily reports, e.g. Asia/Phnom_Penh. */
  timezone: string;
  /** Customers must pay by QR before the order goes to the kitchen. */
  requirePayment: boolean;
  /** Customers may choose to pay cash at the counter instead of scanning the QR. */
  allowCashPayment: boolean;
  /** Discount for smiling at the kiosk camera (0.05 = 5 %, 0 = off). */
  smileDiscountRate: number;
}

export interface KioskConfigDTO {
  shop: ShopSettingsDTO;
  kiosk: KioskDTO | null;
}
