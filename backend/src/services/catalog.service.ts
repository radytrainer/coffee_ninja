import type { Prisma } from '@prisma/client';
import type { z } from 'zod';
import { prisma } from '../config/prisma';
import { badRequest, conflict, notFound } from '../utils/errors';
import {
  optionGroupInclude,
  productInclude,
  serializeCategory,
  serializeOption,
  serializeOptionGroup,
  serializeProduct,
} from '../utils/serializers';
import type {
  categoryCreateSchema,
  categoryUpdateSchema,
  optionCreateSchema,
  optionGroupCreateSchema,
  optionGroupUpdateSchema,
  optionUpdateSchema,
  productCreateSchema,
  productQuerySchema,
  productUpdateSchema,
} from '../validators/catalog';

// =============================================================
// Categories
// =============================================================

export async function listCategories(includeInactive: boolean) {
  const categories = await prisma.category.findMany({
    where: includeInactive ? {} : { active: true },
    orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    include: { _count: { select: { products: true } } },
  });
  return categories.map(serializeCategory);
}

export async function getCategory(id: string, includeInactive: boolean) {
  const category = await prisma.category.findUnique({
    where: { id },
    include: { _count: { select: { products: true } } },
  });
  if (!category || (!includeInactive && !category.active)) throw notFound('Category');
  return serializeCategory(category);
}

export async function createCategory(input: z.infer<typeof categoryCreateSchema>) {
  const category = await prisma.category.create({
    data: input,
    include: { _count: { select: { products: true } } },
  });
  return serializeCategory(category);
}

export async function updateCategory(id: string, input: z.infer<typeof categoryUpdateSchema>) {
  await ensureExists('category', id);
  const category = await prisma.category.update({
    where: { id },
    data: input,
    include: { _count: { select: { products: true } } },
  });
  return serializeCategory(category);
}

export async function deleteCategory(id: string) {
  await ensureExists('category', id);
  const products = await prisma.product.count({ where: { categoryId: id } });
  if (products > 0) {
    throw conflict(
      `Category still has ${products} product(s). Move or delete them first, or deactivate the category.`,
    );
  }
  await prisma.category.delete({ where: { id } });
}

// =============================================================
// Products
// =============================================================

export async function listProducts(
  query: z.infer<typeof productQuerySchema>,
  includeHidden: boolean,
) {
  const where: Prisma.ProductWhereInput = {
    ...(query.categoryId ? { categoryId: query.categoryId } : {}),
    ...(query.available !== undefined ? { available: query.available } : {}),
    ...(query.featured !== undefined ? { featured: query.featured } : {}),
    ...(query.search ? { name: { contains: query.search, mode: 'insensitive' } } : {}),
    // Customers never see products from deactivated categories.
    ...(includeHidden ? {} : { category: { active: true } }),
  };
  const products = await prisma.product.findMany({
    where,
    include: productInclude,
    orderBy: [{ category: { sortOrder: 'asc' } }, { sortOrder: 'asc' }, { name: 'asc' }],
  });
  return products.map(serializeProduct);
}

export async function getProduct(id: string, includeHidden: boolean) {
  const product = await prisma.product.findUnique({
    where: { id },
    include: { ...productInclude, category: { select: { id: true, name: true, active: true } } },
  });
  if (!product || (!includeHidden && !product.category.active)) throw notFound('Product');
  return serializeProduct(product);
}

async function assertCategory(categoryId: string) {
  const exists = await prisma.category.count({ where: { id: categoryId } });
  if (!exists)
    throw badRequest('Category does not exist', [
      { path: 'categoryId', message: 'Unknown category' },
    ]);
}

async function assertOptionGroups(ids: string[]) {
  const unique = [...new Set(ids)];
  if (unique.length !== ids.length) throw badRequest('Option groups must not contain duplicates');
  const found = await prisma.productOptionGroup.count({ where: { id: { in: unique } } });
  if (found !== unique.length) {
    throw badRequest('One or more option groups do not exist', [
      { path: 'optionGroupIds', message: 'Unknown option group' },
    ]);
  }
}

export async function createProduct(input: z.infer<typeof productCreateSchema>) {
  const { optionGroupIds, ...data } = input;
  await assertCategory(data.categoryId);
  await assertOptionGroups(optionGroupIds);
  const product = await prisma.product.create({
    data: {
      ...data,
      optionGroups: {
        create: optionGroupIds.map((groupId, index) => ({ groupId, sortOrder: index + 1 })),
      },
    },
    include: productInclude,
  });
  return serializeProduct(product);
}

export async function updateProduct(id: string, input: z.infer<typeof productUpdateSchema>) {
  await ensureExists('product', id);
  const { optionGroupIds, ...data } = input;
  if (data.categoryId) await assertCategory(data.categoryId);
  if (optionGroupIds) await assertOptionGroups(optionGroupIds);

  const product = await prisma.$transaction(async (tx) => {
    if (optionGroupIds) {
      await tx.productOptionGroupLink.deleteMany({ where: { productId: id } });
      await tx.productOptionGroupLink.createMany({
        data: optionGroupIds.map((groupId, index) => ({
          productId: id,
          groupId,
          sortOrder: index + 1,
        })),
      });
    }
    return tx.product.update({ where: { id }, data, include: productInclude });
  });
  return serializeProduct(product);
}

/** Order history keeps name/price snapshots, so deleting a product is safe. */
export async function deleteProduct(id: string) {
  await ensureExists('product', id);
  await prisma.product.delete({ where: { id } });
}

// =============================================================
// Option groups & options
// =============================================================

export async function listOptionGroups() {
  const groups = await prisma.productOptionGroup.findMany({
    include: optionGroupInclude,
    orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
  });
  return groups.map(serializeOptionGroup);
}

export async function getOptionGroup(id: string) {
  const group = await prisma.productOptionGroup.findUnique({
    where: { id },
    include: optionGroupInclude,
  });
  if (!group) throw notFound('Option group');
  return serializeOptionGroup(group);
}

function assertGroupConsistency(g: {
  selectionType: 'SINGLE' | 'MULTIPLE';
  required: boolean;
  minSelect: number;
  maxSelect: number;
}) {
  if (g.selectionType === 'SINGLE' && g.maxSelect !== 1) {
    throw badRequest('A single-choice group must have maxSelect = 1', [
      { path: 'maxSelect', message: 'Must be 1 for SINGLE groups' },
    ]);
  }
  if (g.required && g.minSelect < 1) {
    throw badRequest('A required group must have minSelect of at least 1', [
      { path: 'minSelect', message: 'Must be >= 1 when required' },
    ]);
  }
  if (g.minSelect > g.maxSelect) throw badRequest('minSelect cannot be greater than maxSelect');
}

export async function createOptionGroup(input: z.infer<typeof optionGroupCreateSchema>) {
  const { options, ...data } = input;
  const normalized = {
    ...data,
    maxSelect: data.selectionType === 'SINGLE' ? 1 : data.maxSelect,
    minSelect: data.required ? Math.max(1, data.minSelect) : data.minSelect,
  };
  assertGroupConsistency(normalized);
  const names = options.map((o) => o.name.toLowerCase());
  if (new Set(names).size !== names.length)
    throw badRequest('Option names must be unique within a group');

  const group = await prisma.productOptionGroup.create({
    data: {
      ...normalized,
      options: {
        create: options.map((o, index) => ({ ...o, sortOrder: o.sortOrder || index + 1 })),
      },
    },
    include: optionGroupInclude,
  });
  return serializeOptionGroup(group);
}

export async function updateOptionGroup(
  id: string,
  input: z.infer<typeof optionGroupUpdateSchema>,
) {
  const existing = await prisma.productOptionGroup.findUnique({ where: { id } });
  if (!existing) throw notFound('Option group');
  const merged = { ...existing, ...input };
  if (merged.selectionType === 'SINGLE') merged.maxSelect = 1;
  if (merged.required && merged.minSelect < 1) merged.minSelect = 1;
  assertGroupConsistency(merged);
  const group = await prisma.productOptionGroup.update({
    where: { id },
    data: {
      ...input,
      maxSelect: merged.maxSelect,
      minSelect: merged.minSelect,
    },
    include: optionGroupInclude,
  });
  return serializeOptionGroup(group);
}

export async function deleteOptionGroup(id: string) {
  await ensureExists('optionGroup', id);
  // Links cascade; past orders keep option name/price snapshots.
  await prisma.productOptionGroup.delete({ where: { id } });
}

export async function createOption(groupId: string, input: z.infer<typeof optionCreateSchema>) {
  await ensureExists('optionGroup', groupId);
  const option = await prisma.productOption.create({ data: { ...input, groupId } });
  return serializeOption(option);
}

export async function updateOption(id: string, input: z.infer<typeof optionUpdateSchema>) {
  await ensureExists('option', id);
  const option = await prisma.productOption.update({ where: { id }, data: input });
  return serializeOption(option);
}

export async function deleteOption(id: string) {
  await ensureExists('option', id);
  await prisma.productOption.delete({ where: { id } });
}

// =============================================================

async function ensureExists(model: 'category' | 'product' | 'optionGroup' | 'option', id: string) {
  const counts = {
    category: () => prisma.category.count({ where: { id } }),
    product: () => prisma.product.count({ where: { id } }),
    optionGroup: () => prisma.productOptionGroup.count({ where: { id } }),
    option: () => prisma.productOption.count({ where: { id } }),
  };
  const labels = {
    category: 'Category',
    product: 'Product',
    optionGroup: 'Option group',
    option: 'Option',
  };
  if ((await counts[model]()) === 0) throw notFound(labels[model]);
}
