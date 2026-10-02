import { OrderStatus, Prisma, PrismaClient, SelectionType } from '@prisma/client';
import bcrypt from 'bcryptjs';

/**
 * Idempotent seed: running it twice does not create duplicates.
 * Exported as a function so automated tests can re-seed the test database.
 */
export interface SeedOptions {
  adminEmail: string;
  adminPassword: string;
  staffEmail: string;
  staffPassword: string;
  bcryptRounds?: number;
  /** Create ~a week of completed historical orders so reports/charts have data. */
  demoOrders?: boolean;
  log?: (message: string) => void;
}

interface OptionSeed {
  name: string;
  priceDelta: number;
  isDefault?: boolean;
}

interface GroupSeed {
  name: string;
  description: string;
  selectionType: SelectionType;
  required: boolean;
  minSelect: number;
  maxSelect: number;
  sortOrder: number;
  options: OptionSeed[];
}

const OPTION_GROUPS: GroupSeed[] = [
  {
    name: 'Size',
    description: 'Cup size',
    selectionType: 'SINGLE',
    required: true,
    minSelect: 1,
    maxSelect: 1,
    sortOrder: 1,
    options: [
      { name: 'Small', priceDelta: 0, isDefault: true },
      { name: 'Medium', priceDelta: 0.5 },
      { name: 'Large', priceDelta: 1.0 },
    ],
  },
  {
    name: 'Milk',
    description: 'Choice of milk',
    selectionType: 'SINGLE',
    required: true,
    minSelect: 1,
    maxSelect: 1,
    sortOrder: 2,
    options: [
      { name: 'Regular Milk', priceDelta: 0, isDefault: true },
      { name: 'Oat Milk', priceDelta: 0.5 },
      { name: 'Soy Milk', priceDelta: 0.5 },
      { name: 'Almond Milk', priceDelta: 0.5 },
    ],
  },
  {
    name: 'Sugar',
    description: 'Sugar level (spoons)',
    selectionType: 'SINGLE',
    required: true,
    minSelect: 1,
    maxSelect: 1,
    sortOrder: 3,
    options: [
      { name: '0', priceDelta: 0 },
      { name: '1', priceDelta: 0, isDefault: true },
      { name: '2', priceDelta: 0 },
      { name: '3', priceDelta: 0 },
    ],
  },
  {
    name: 'Temperature',
    description: 'Serve hot or iced',
    selectionType: 'SINGLE',
    required: true,
    minSelect: 1,
    maxSelect: 1,
    sortOrder: 4,
    options: [
      { name: 'Hot', priceDelta: 0, isDefault: true },
      { name: 'Iced', priceDelta: 0.2 },
    ],
  },
  {
    name: 'Ice Level',
    description: 'Amount of ice',
    selectionType: 'SINGLE',
    required: true,
    minSelect: 1,
    maxSelect: 1,
    sortOrder: 4,
    options: [
      { name: 'Regular Ice', priceDelta: 0, isDefault: true },
      { name: 'Less Ice', priceDelta: 0 },
      { name: 'No Ice', priceDelta: 0 },
    ],
  },
  {
    name: 'Extras',
    description: 'Add some extra flavour',
    selectionType: 'MULTIPLE',
    required: false,
    minSelect: 0,
    maxSelect: 4,
    sortOrder: 5,
    options: [
      { name: 'Extra Espresso', priceDelta: 0.8 },
      { name: 'Vanilla', priceDelta: 0.3 },
      { name: 'Caramel', priceDelta: 0.3 },
      { name: 'Whipped Cream', priceDelta: 0.4 },
    ],
  },
  {
    name: 'Smoothie Boost',
    description: 'Healthy add-ons',
    selectionType: 'MULTIPLE',
    required: false,
    minSelect: 0,
    maxSelect: 2,
    sortOrder: 5,
    options: [
      { name: 'Chia Seeds', priceDelta: 0.4 },
      { name: 'Protein', priceDelta: 0.9 },
      { name: 'Honey', priceDelta: 0.3 },
    ],
  },
  {
    name: 'Serving',
    description: 'How would you like it?',
    selectionType: 'SINGLE',
    required: true,
    minSelect: 1,
    maxSelect: 1,
    sortOrder: 1,
    options: [
      { name: 'Warmed', priceDelta: 0, isDefault: true },
      { name: 'Room Temperature', priceDelta: 0 },
    ],
  },
];

const CATEGORIES = [
  {
    name: 'Coffee',
    description: 'Freshly pulled espresso classics',
    image: '/static/products/latte.svg',
  },
  {
    name: 'Iced Coffee',
    description: 'Chilled coffee over ice',
    image: '/static/products/iced-latte.svg',
  },
  {
    name: 'Tea',
    description: 'Loose-leaf teas, brewed to order',
    image: '/static/products/green-tea.svg',
  },
  {
    name: 'Smoothies',
    description: 'Blended fresh fruit',
    image: '/static/products/mango-smoothie.svg',
  },
  { name: 'Bakery', description: 'Baked every morning', image: '/static/products/croissant.svg' },
  { name: 'Dessert', description: 'Something sweet', image: '/static/products/chocolate-cake.svg' },
];

interface ProductSeed {
  name: string;
  description: string;
  price: number;
  category: string;
  image: string;
  featured?: boolean;
  groups: string[];
}

const HOT_COFFEE = ['Size', 'Milk', 'Sugar', 'Temperature', 'Extras'];
const ICED_COFFEE = ['Size', 'Milk', 'Sugar', 'Ice Level', 'Extras'];

const PRODUCTS: ProductSeed[] = [
  {
    name: 'Latte',
    description: 'Creamy espresso with steamed milk',
    price: 2.5,
    category: 'Coffee',
    image: 'latte',
    featured: true,
    groups: HOT_COFFEE,
  },
  {
    name: 'Cappuccino',
    description: 'Espresso with a thick layer of velvety foam',
    price: 2.5,
    category: 'Coffee',
    image: 'cappuccino',
    featured: true,
    groups: HOT_COFFEE,
  },
  {
    name: 'Americano',
    description: 'Espresso lengthened with hot water',
    price: 2.0,
    category: 'Coffee',
    image: 'americano',
    groups: ['Size', 'Sugar', 'Temperature', 'Extras'],
  },
  {
    name: 'Mocha',
    description: 'Espresso, dark chocolate and steamed milk',
    price: 2.8,
    category: 'Coffee',
    image: 'mocha',
    groups: HOT_COFFEE,
  },
  {
    name: 'Espresso',
    description: 'A rich, concentrated double shot',
    price: 1.8,
    category: 'Coffee',
    image: 'espresso',
    groups: ['Sugar', 'Extras'],
  },
  {
    name: 'Iced Latte',
    description: 'Espresso and cold milk poured over ice',
    price: 2.8,
    category: 'Iced Coffee',
    image: 'iced-latte',
    featured: true,
    groups: ICED_COFFEE,
  },
  {
    name: 'Iced Americano',
    description: 'Bold espresso over ice and cold water',
    price: 2.3,
    category: 'Iced Coffee',
    image: 'iced-americano',
    groups: ['Size', 'Sugar', 'Ice Level', 'Extras'],
  },
  {
    name: 'Iced Caramel Macchiato',
    description: 'Vanilla milk, espresso and caramel drizzle',
    price: 3.2,
    category: 'Iced Coffee',
    image: 'iced-caramel-macchiato',
    groups: ICED_COFFEE,
  },
  {
    name: 'Green Tea',
    description: 'Delicate Japanese sencha',
    price: 1.8,
    category: 'Tea',
    image: 'green-tea',
    groups: ['Size', 'Sugar', 'Temperature'],
  },
  {
    name: 'Matcha Latte',
    description: 'Ceremonial matcha whisked with milk',
    price: 3.0,
    category: 'Tea',
    image: 'matcha-latte',
    featured: true,
    groups: ['Size', 'Milk', 'Sugar', 'Temperature'],
  },
  {
    name: 'Jasmine Tea',
    description: 'Fragrant green tea scented with jasmine',
    price: 1.8,
    category: 'Tea',
    image: 'jasmine-tea',
    groups: ['Size', 'Sugar', 'Temperature'],
  },
  {
    name: 'Mango Smoothie',
    description: 'Ripe mango blended with yogurt',
    price: 3.2,
    category: 'Smoothies',
    image: 'mango-smoothie',
    groups: ['Size', 'Sugar', 'Smoothie Boost'],
  },
  {
    name: 'Mixed Berry Smoothie',
    description: 'Strawberry, blueberry and banana',
    price: 3.4,
    category: 'Smoothies',
    image: 'berry-smoothie',
    groups: ['Size', 'Sugar', 'Smoothie Boost'],
  },
  {
    name: 'Croissant',
    description: 'Flaky, buttery French pastry',
    price: 1.8,
    category: 'Bakery',
    image: 'croissant',
    groups: ['Serving'],
  },
  {
    name: 'Blueberry Muffin',
    description: 'Soft muffin bursting with blueberries',
    price: 2.0,
    category: 'Bakery',
    image: 'blueberry-muffin',
    groups: ['Serving'],
  },
  {
    name: 'Chocolate Cake',
    description: 'Rich layered dark chocolate cake',
    price: 3.5,
    category: 'Dessert',
    image: 'chocolate-cake',
    featured: true,
    groups: [],
  },
  {
    name: 'Cheesecake',
    description: 'New York style with berry topping',
    price: 3.5,
    category: 'Dessert',
    image: 'cheesecake',
    groups: [],
  },
];

const INVENTORY = [
  { name: 'Espresso Beans', unit: 'kg', quantity: 12, lowStockThreshold: 3 },
  { name: 'Whole Milk', unit: 'L', quantity: 30, lowStockThreshold: 8 },
  { name: 'Oat Milk', unit: 'L', quantity: 10, lowStockThreshold: 3 },
  { name: 'Soy Milk', unit: 'L', quantity: 6, lowStockThreshold: 3 },
  { name: 'Almond Milk', unit: 'L', quantity: 2, lowStockThreshold: 3 },
  { name: 'Green Tea Leaves', unit: 'kg', quantity: 2, lowStockThreshold: 0.5 },
  { name: 'Matcha Powder', unit: 'kg', quantity: 1.2, lowStockThreshold: 0.3 },
  { name: 'Croissants', unit: 'pcs', quantity: 24, lowStockThreshold: 6, product: 'Croissant' },
  {
    name: 'Blueberry Muffins',
    unit: 'pcs',
    quantity: 18,
    lowStockThreshold: 6,
    product: 'Blueberry Muffin',
  },
  {
    name: 'Chocolate Cake Slices',
    unit: 'pcs',
    quantity: 10,
    lowStockThreshold: 4,
    product: 'Chocolate Cake',
  },
  {
    name: 'Cheesecake Slices',
    unit: 'pcs',
    quantity: 3,
    lowStockThreshold: 4,
    product: 'Cheesecake',
  },
  { name: 'Cups (12oz)', unit: 'pcs', quantity: 400, lowStockThreshold: 100 },
];

export const DEFAULT_SETTINGS: Record<string, Prisma.InputJsonValue> = {
  shopName: 'PNC Coffee',
  currency: 'USD',
  taxRate: 0.1,
  orderNumberPrefix: 'A',
  timezone: 'Asia/Phnom_Penh',
};

const toCents = (value: number | Prisma.Decimal) => Math.round(Number(value) * 100);

export async function seedDatabase(prisma: PrismaClient, opts: SeedOptions): Promise<void> {
  const log = opts.log ?? (() => undefined);
  const rounds = opts.bcryptRounds ?? 12;

  // ---- settings ----
  for (const [key, value] of Object.entries(DEFAULT_SETTINGS)) {
    await prisma.setting.upsert({ where: { key }, update: {}, create: { key, value } });
  }

  // ---- users ----
  await prisma.user.upsert({
    where: { email: opts.adminEmail },
    update: {},
    create: {
      email: opts.adminEmail,
      name: 'Shop Admin',
      role: 'ADMIN',
      passwordHash: await bcrypt.hash(opts.adminPassword, rounds),
    },
  });
  await prisma.user.upsert({
    where: { email: opts.staffEmail },
    update: {},
    create: {
      email: opts.staffEmail,
      name: 'Barista Dara',
      role: 'STAFF',
      passwordHash: await bcrypt.hash(opts.staffPassword, rounds),
    },
  });
  log('users ready');

  // ---- kiosk ----
  const kiosk = await prisma.kiosk.upsert({
    where: { code: 'KIOSK-01' },
    update: {},
    create: { code: 'KIOSK-01', name: 'Front Counter Kiosk', location: 'Main entrance' },
  });

  // ---- categories ----
  const categoryIds = new Map<string, string>();
  for (const [index, c] of CATEGORIES.entries()) {
    const category = await prisma.category.upsert({
      where: { name: c.name },
      update: {},
      create: { ...c, sortOrder: index + 1 },
    });
    categoryIds.set(c.name, category.id);
  }
  log(`${CATEGORIES.length} categories ready`);

  // ---- option groups ----
  const groupIds = new Map<string, string>();
  for (const g of OPTION_GROUPS) {
    const { options, ...groupData } = g;
    const group = await prisma.productOptionGroup.upsert({
      where: { name: g.name },
      update: {},
      create: groupData,
    });
    groupIds.set(g.name, group.id);
    for (const [index, o] of options.entries()) {
      await prisma.productOption.upsert({
        where: { groupId_name: { groupId: group.id, name: o.name } },
        update: {},
        create: {
          groupId: group.id,
          name: o.name,
          priceDelta: o.priceDelta,
          isDefault: o.isDefault ?? false,
          sortOrder: index + 1,
        },
      });
    }
  }
  log(`${OPTION_GROUPS.length} option groups ready`);

  // ---- products ----
  const productIds = new Map<string, string>();
  for (const [index, p] of PRODUCTS.entries()) {
    const product = await prisma.product.upsert({
      where: { name: p.name },
      update: {},
      create: {
        name: p.name,
        description: p.description,
        price: p.price,
        image: `/static/products/${p.image}.svg`,
        featured: p.featured ?? false,
        sortOrder: index + 1,
        categoryId: categoryIds.get(p.category)!,
      },
    });
    productIds.set(p.name, product.id);
    for (const [gi, groupName] of p.groups.entries()) {
      const groupId = groupIds.get(groupName)!;
      await prisma.productOptionGroupLink.upsert({
        where: { productId_groupId: { productId: product.id, groupId } },
        update: {},
        create: { productId: product.id, groupId, sortOrder: gi + 1 },
      });
    }
  }
  log(`${PRODUCTS.length} products ready`);

  // ---- inventory ----
  for (const item of INVENTORY) {
    const { product, ...data } = item;
    await prisma.inventoryItem.upsert({
      where: { name: item.name },
      update: {},
      create: { ...data, productId: product ? productIds.get(product) : undefined },
    });
  }
  log(`${INVENTORY.length} inventory items ready`);

  if (opts.demoOrders && (await prisma.order.count()) === 0) {
    const created = await createDemoOrders(prisma, kiosk.id);
    log(`${created} demo orders created`);
  }
}

/** Deterministic pseudo-random generator so demo data is reproducible. */
function mulberry32(seed: number) {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

async function createDemoOrders(prisma: PrismaClient, kioskId: string): Promise<number> {
  const rand = mulberry32(42);
  const products = await prisma.product.findMany({
    include: { optionGroups: { include: { group: { include: { options: true } } } } },
  });
  const staff = await prisma.user.findFirst({ where: { role: 'STAFF' } });
  const prefix = String(DEFAULT_SETTINGS.orderNumberPrefix);
  const taxRate = Number(DEFAULT_SETTINGS.taxRate);
  let count = 0;

  for (let daysAgo = 7; daysAgo >= 1; daysAgo--) {
    const ordersToday = 6 + Math.floor(rand() * 8);
    for (let i = 0; i < ordersToday; i++) {
      const createdAt = new Date();
      createdAt.setDate(createdAt.getDate() - daysAgo);
      createdAt.setHours(7 + Math.floor(rand() * 12), Math.floor(rand() * 60), 0, 0);

      const lineCount = 1 + Math.floor(rand() * 3);
      const items: Prisma.OrderItemCreateWithoutOrderInput[] = [];
      let subtotalCents = 0;
      for (let l = 0; l < lineCount; l++) {
        const product = products[Math.floor(rand() * products.length)]!;
        const quantity = 1 + Math.floor(rand() * 2);
        const options = product.optionGroups.map(({ group }) => {
          const pool = group.options;
          const chosen =
            group.selectionType === 'SINGLE'
              ? pool[Math.floor(rand() * pool.length)]!
              : (pool.find((o) => o.isDefault) ?? pool[0]!);
          return { group, option: chosen };
        });
        const chosenOptions = options.filter(({ group }) => group.required || rand() < 0.3);
        const unitCents =
          toCents(product.price) +
          chosenOptions.reduce((s, o) => s + toCents(o.option.priceDelta), 0);
        const lineCents = unitCents * quantity;
        subtotalCents += lineCents;
        items.push({
          product: { connect: { id: product.id } },
          productName: product.name,
          quantity,
          basePrice: product.price,
          unitPrice: unitCents / 100,
          lineTotal: lineCents / 100,
          options: {
            create: chosenOptions.map(({ group, option }) => ({
              option: { connect: { id: option.id } },
              groupName: group.name,
              optionName: option.name,
              priceDelta: option.priceDelta,
            })),
          },
        });
      }
      const taxCents = Math.round(subtotalCents * taxRate);
      const cancelled = rand() < 0.05;
      const seq = await prisma.$queryRaw<{ nextval: bigint }[]>`SELECT nextval('order_number_seq')`;
      const nextval = seq[0]!.nextval;
      const at = (minutes: number) => new Date(createdAt.getTime() + minutes * 60_000);
      const history: { status: OrderStatus; createdAt: Date }[] = cancelled
        ? [
            { status: 'NEW', createdAt },
            { status: 'CANCELLED', createdAt: at(2) },
          ]
        : [
            { status: 'NEW', createdAt },
            { status: 'ACCEPTED', createdAt: at(1) },
            { status: 'PREPARING', createdAt: at(2) },
            { status: 'READY', createdAt: at(7) },
            { status: 'COMPLETED', createdAt: at(9) },
          ];
      await prisma.order.create({
        data: {
          orderNumber: `${prefix}${nextval}`,
          status: cancelled ? 'CANCELLED' : 'COMPLETED',
          subtotal: subtotalCents / 100,
          tax: taxCents / 100,
          total: (subtotalCents + taxCents) / 100,
          taxRate,
          kioskId,
          createdAt,
          updatedAt: history[history.length - 1]!.createdAt,
          completedAt: cancelled ? null : at(9),
          items: { create: items },
          statusHistory: {
            create: history.map((h) => ({
              ...h,
              changedById: h.status === 'NEW' ? null : (staff?.id ?? null),
            })),
          },
        },
      });
      count++;
    }
  }
  return count;
}
