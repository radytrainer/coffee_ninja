import type { Prisma } from '@prisma/client';
import type {
  CategoryDTO,
  OrderDTO,
  ProductDTO,
  ProductOptionDTO,
  ProductOptionGroupDTO,
  PublicOrderStatusDTO,
  UserDTO,
} from '@gcs/types';
import { ORDER_STATUS_MESSAGES } from '@gcs/types';
import { decimalToNumber } from './money';

const iso = (d: Date | null | undefined) => (d ? d.toISOString() : null);

// ---------- catalog ----------

export type CategoryWithCount = Prisma.CategoryGetPayload<{
  include: { _count: { select: { products: true } } };
}>;

export function serializeCategory(
  c: CategoryWithCount | Prisma.CategoryGetPayload<object>,
): CategoryDTO {
  return {
    id: c.id,
    name: c.name,
    description: c.description,
    image: c.image,
    sortOrder: c.sortOrder,
    active: c.active,
    ...('_count' in c ? { productCount: c._count.products } : {}),
    createdAt: c.createdAt.toISOString(),
    updatedAt: c.updatedAt.toISOString(),
  };
}

export function serializeOption(o: Prisma.ProductOptionGetPayload<object>): ProductOptionDTO {
  return {
    id: o.id,
    groupId: o.groupId,
    name: o.name,
    priceDelta: decimalToNumber(o.priceDelta),
    isDefault: o.isDefault,
    available: o.available,
    sortOrder: o.sortOrder,
  };
}

export const optionGroupInclude = {
  options: { orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }] },
  _count: { select: { products: true } },
} satisfies Prisma.ProductOptionGroupInclude;

export type OptionGroupWithOptions = Prisma.ProductOptionGroupGetPayload<{
  include: { options: true };
}> & { _count?: { products: number } };

export function serializeOptionGroup(g: OptionGroupWithOptions): ProductOptionGroupDTO {
  return {
    id: g.id,
    name: g.name,
    description: g.description,
    selectionType: g.selectionType,
    required: g.required,
    minSelect: g.minSelect,
    maxSelect: g.maxSelect,
    sortOrder: g.sortOrder,
    options: g.options.map(serializeOption),
    ...(g._count ? { productCount: g._count.products } : {}),
  };
}

export const productInclude = {
  category: { select: { id: true, name: true } },
  optionGroups: {
    orderBy: { sortOrder: 'asc' },
    include: {
      group: { include: { options: { orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }] } } },
    },
  },
} satisfies Prisma.ProductInclude;

export type ProductWithRelations = Prisma.ProductGetPayload<{ include: typeof productInclude }>;

export function serializeProduct(p: ProductWithRelations): ProductDTO {
  return {
    id: p.id,
    name: p.name,
    description: p.description,
    price: decimalToNumber(p.price),
    image: p.image,
    categoryId: p.categoryId,
    category: p.category,
    available: p.available,
    featured: p.featured,
    sortOrder: p.sortOrder,
    optionGroups: p.optionGroups.map((link) => serializeOptionGroup(link.group)),
    createdAt: p.createdAt.toISOString(),
    updatedAt: p.updatedAt.toISOString(),
  };
}

// ---------- orders ----------

export const orderInclude = {
  payment: { select: { provider: true, status: true, expiresAt: true } },
  items: { include: { options: true }, orderBy: { id: 'asc' } },
  statusHistory: {
    orderBy: { createdAt: 'asc' },
    include: { changedBy: { select: { id: true, name: true } } },
  },
} satisfies Prisma.OrderInclude;

export type OrderWithRelations = Prisma.OrderGetPayload<{ include: typeof orderInclude }>;

export function serializeOrder(o: OrderWithRelations): OrderDTO {
  return {
    id: o.id,
    orderNumber: o.orderNumber,
    status: o.status,
    subtotal: decimalToNumber(o.subtotal),
    discount: decimalToNumber(o.discount),
    discountReason: o.discountReason,
    tax: decimalToNumber(o.tax),
    total: decimalToNumber(o.total),
    taxRate: decimalToNumber(o.taxRate),
    paidAt: iso(o.paidAt),
    payment: o.payment
      ? {
          provider: o.payment.provider,
          status: o.payment.status,
          expiresAt: o.payment.expiresAt.toISOString(),
        }
      : null,
    kioskId: o.kioskId,
    items: o.items.map((i) => ({
      id: i.id,
      productId: i.productId,
      productName: i.productName,
      quantity: i.quantity,
      basePrice: decimalToNumber(i.basePrice),
      unitPrice: decimalToNumber(i.unitPrice),
      lineTotal: decimalToNumber(i.lineTotal),
      notes: i.notes,
      options: i.options.map((opt) => ({
        id: opt.id,
        optionId: opt.optionId,
        groupName: opt.groupName,
        optionName: opt.optionName,
        priceDelta: decimalToNumber(opt.priceDelta),
      })),
    })),
    statusHistory: o.statusHistory.map((h) => ({
      id: h.id,
      status: h.status,
      note: h.note,
      changedBy: h.changedBy,
      createdAt: h.createdAt.toISOString(),
    })),
    createdAt: o.createdAt.toISOString(),
    updatedAt: o.updatedAt.toISOString(),
  };
}

export function serializePublicOrder(
  o: Pick<
    OrderWithRelations,
    'id' | 'orderNumber' | 'status' | 'total' | 'createdAt' | 'updatedAt'
  >,
): PublicOrderStatusDTO {
  return {
    id: o.id,
    orderNumber: o.orderNumber,
    status: o.status,
    message: ORDER_STATUS_MESSAGES[o.status],
    total: decimalToNumber(o.total),
    createdAt: o.createdAt.toISOString(),
    updatedAt: o.updatedAt.toISOString(),
  };
}

// ---------- users ----------

export const userSelect = {
  id: true,
  email: true,
  name: true,
  role: true,
  active: true,
  lastLoginAt: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.UserSelect;

export function serializeUser(u: Prisma.UserGetPayload<{ select: typeof userSelect }>): UserDTO {
  return {
    id: u.id,
    email: u.email,
    name: u.name,
    role: u.role,
    active: u.active,
    lastLoginAt: iso(u.lastLoginAt),
    createdAt: u.createdAt.toISOString(),
    updatedAt: u.updatedAt.toISOString(),
  };
}
