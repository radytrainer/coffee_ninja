import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ADMIN, STAFF, app, loginAs, prisma, resetDatabase } from './helpers';

let adminCookie: string;
let staffCookie: string;

beforeAll(async () => {
  await resetDatabase();
  adminCookie = await loginAs(ADMIN);
  staffCookie = await loginAs(STAFF);
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe('categories', () => {
  it('lists active categories publicly, sorted', async () => {
    const res = await request(app).get('/api/categories');
    expect(res.status).toBe(200);
    const names = res.body.data.map((c: { name: string }) => c.name);
    expect(names).toEqual(['Coffee', 'Iced Coffee', 'Tea', 'Smoothies', 'Bakery', 'Dessert']);
  });

  it('requires admin to create categories', async () => {
    const payload = { name: 'Seasonal' };
    expect((await request(app).post('/api/categories').send(payload)).status).toBe(401);
    const staff = await request(app)
      .post('/api/categories')
      .set('Cookie', staffCookie)
      .send(payload);
    expect(staff.status).toBe(403);
    expect(staff.body.error.code).toBe('FORBIDDEN');
  });

  it('supports create, update, hide and delete', async () => {
    const created = await request(app)
      .post('/api/categories')
      .set('Cookie', adminCookie)
      .send({ name: 'Seasonal', description: 'Limited time', sortOrder: 9 });
    expect(created.status).toBe(201);
    const id = created.body.data.id as string;

    const updated = await request(app)
      .put(`/api/categories/${id}`)
      .set('Cookie', adminCookie)
      .send({ active: false });
    expect(updated.body.data.active).toBe(false);

    const publicList = await request(app).get('/api/categories');
    expect(publicList.body.data.some((c: { id: string }) => c.id === id)).toBe(false);
    const adminList = await request(app).get('/api/categories?all=true').set('Cookie', adminCookie);
    expect(adminList.body.data.some((c: { id: string }) => c.id === id)).toBe(true);

    const del = await request(app).delete(`/api/categories/${id}`).set('Cookie', adminCookie);
    expect(del.status).toBe(200);
    expect(
      (await request(app).get(`/api/categories/${id}`).set('Cookie', adminCookie)).status,
    ).toBe(404);
  });

  it('rejects duplicate names with 409', async () => {
    const res = await request(app)
      .post('/api/categories')
      .set('Cookie', adminCookie)
      .send({ name: 'Coffee' });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('CONFLICT');
  });

  it('refuses to delete a category that still has products', async () => {
    const coffee = await prisma.category.findUniqueOrThrow({ where: { name: 'Coffee' } });
    const res = await request(app)
      .delete(`/api/categories/${coffee.id}`)
      .set('Cookie', adminCookie);
    expect(res.status).toBe(409);
  });
});

describe('products', () => {
  it('lists products with option groups and numeric prices', async () => {
    const res = await request(app).get('/api/products');
    expect(res.status).toBe(200);
    const latte = res.body.data.find((p: { name: string }) => p.name === 'Latte');
    expect(latte.price).toBe(2.5);
    expect(latte.optionGroups.map((g: { name: string }) => g.name)).toEqual([
      'Size',
      'Milk',
      'Sugar',
      'Temperature',
      'Extras',
    ]);
    const size = latte.optionGroups[0];
    expect(
      size.options.map((o: { name: string; priceDelta: number }) => [o.name, o.priceDelta]),
    ).toEqual([
      ['Small', 0],
      ['Medium', 0.5],
      ['Large', 1],
    ]);
  });

  it('filters by category and search', async () => {
    const tea = await prisma.category.findUniqueOrThrow({ where: { name: 'Tea' } });
    const byCategory = await request(app).get(`/api/products?categoryId=${tea.id}`);
    expect(byCategory.body.data.every((p: { categoryId: string }) => p.categoryId === tea.id)).toBe(
      true,
    );
    const search = await request(app).get('/api/products?search=iced');
    expect(search.body.data.length).toBeGreaterThanOrEqual(3);
  });

  it('gets a single product and 404s for unknown ids', async () => {
    const latte = await prisma.product.findUniqueOrThrow({ where: { name: 'Latte' } });
    expect((await request(app).get(`/api/products/${latte.id}`)).body.data.name).toBe('Latte');
    const missing = await request(app).get('/api/products/cm0000000000000000000000');
    expect(missing.status).toBe(404);
    const invalid = await request(app).get('/api/products/not-an-id!');
    expect(invalid.status).toBe(400);
  });

  it('validates prices', async () => {
    const category = await prisma.category.findUniqueOrThrow({ where: { name: 'Coffee' } });
    for (const price of [-1, 0, 2.555, 'abc', 100_000]) {
      const res = await request(app)
        .post('/api/products')
        .set('Cookie', adminCookie)
        .send({ name: `Bad ${String(price)}`, price, categoryId: category.id });
      expect(res.status).toBe(400);
      expect(res.body).toMatchObject({ success: false, error: { code: 'VALIDATION_ERROR' } });
    }
  });

  it('creates, updates and deletes a product with option groups', async () => {
    const category = await prisma.category.findUniqueOrThrow({ where: { name: 'Coffee' } });
    const size = await prisma.productOptionGroup.findUniqueOrThrow({ where: { name: 'Size' } });
    const extras = await prisma.productOptionGroup.findUniqueOrThrow({ where: { name: 'Extras' } });

    const created = await request(app)
      .post('/api/products')
      .set('Cookie', adminCookie)
      .send({
        name: 'Flat White',
        description: 'Ristretto with microfoam',
        price: 2.9,
        categoryId: category.id,
        image: '/static/products/latte.svg',
        optionGroupIds: [size.id, extras.id],
      });
    expect(created.status).toBe(201);
    expect(created.body.data.optionGroups.map((g: { name: string }) => g.name)).toEqual([
      'Size',
      'Extras',
    ]);
    const id = created.body.data.id as string;

    const updated = await request(app)
      .put(`/api/products/${id}`)
      .set('Cookie', adminCookie)
      .send({ price: 3.1, available: false, optionGroupIds: [extras.id] });
    expect(updated.status).toBe(200);
    expect(updated.body.data.price).toBe(3.1);
    expect(updated.body.data.available).toBe(false);
    expect(updated.body.data.optionGroups).toHaveLength(1);

    expect(
      (await request(app).delete(`/api/products/${id}`).set('Cookie', adminCookie)).status,
    ).toBe(200);
    expect((await request(app).get(`/api/products/${id}`)).status).toBe(404);
  });

  it('partial updates leave omitted fields untouched', async () => {
    const latte = await prisma.product.findUniqueOrThrow({ where: { name: 'Latte' } });
    const res = await request(app)
      .put(`/api/products/${latte.id}`)
      .set('Cookie', adminCookie)
      .send({ price: 2.6 });
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({
      price: 2.6,
      featured: true,
      available: true,
      description: 'Creamy espresso with steamed milk',
    });
    expect(res.body.data.optionGroups).toHaveLength(5);
    await request(app)
      .put(`/api/products/${latte.id}`)
      .set('Cookie', adminCookie)
      .send({ price: 2.5 });
  });

  it('rejects unknown categories and option groups', async () => {
    const category = await prisma.category.findUniqueOrThrow({ where: { name: 'Coffee' } });
    const badCategory = await request(app)
      .post('/api/products')
      .set('Cookie', adminCookie)
      .send({ name: 'Ghost', price: 1, categoryId: 'cm0000000000000000000000' });
    expect(badCategory.status).toBe(400);
    const badGroup = await request(app)
      .post('/api/products')
      .set('Cookie', adminCookie)
      .send({
        name: 'Ghost',
        price: 1,
        categoryId: category.id,
        optionGroupIds: ['cm0000000000000000000000'],
      });
    expect(badGroup.status).toBe(400);
  });
});

describe('option groups', () => {
  it('creates a reusable group with options and manages options', async () => {
    const created = await request(app)
      .post('/api/option-groups')
      .set('Cookie', adminCookie)
      .send({
        name: 'Syrup',
        selectionType: 'MULTIPLE',
        maxSelect: 2,
        options: [
          { name: 'Hazelnut', priceDelta: 0.3 },
          { name: 'Mint', priceDelta: 0.3 },
        ],
      });
    expect(created.status).toBe(201);
    const groupId = created.body.data.id as string;
    expect(created.body.data.options).toHaveLength(2);

    const option = await request(app)
      .post(`/api/option-groups/${groupId}/options`)
      .set('Cookie', adminCookie)
      .send({ name: 'Lavender', priceDelta: 0.5 });
    expect(option.status).toBe(201);

    const updated = await request(app)
      .put(`/api/options/${option.body.data.id}`)
      .set('Cookie', adminCookie)
      .send({ priceDelta: 0.45, available: false });
    expect(updated.body.data).toMatchObject({ priceDelta: 0.45, available: false });

    const badPrice = await request(app)
      .put(`/api/options/${option.body.data.id}`)
      .set('Cookie', adminCookie)
      .send({ priceDelta: -0.2 });
    expect(badPrice.status).toBe(400);

    expect(
      (await request(app).delete(`/api/options/${option.body.data.id}`).set('Cookie', adminCookie))
        .status,
    ).toBe(200);
    expect(
      (await request(app).delete(`/api/option-groups/${groupId}`).set('Cookie', adminCookie))
        .status,
    ).toBe(200);
  });

  it('forces single-choice groups to maxSelect 1 and validates ranges', async () => {
    const single = await request(app)
      .post('/api/option-groups')
      .set('Cookie', adminCookie)
      .send({ name: 'Cup Type', selectionType: 'SINGLE', required: true, maxSelect: 3 });
    expect(single.status).toBe(201);
    expect(single.body.data).toMatchObject({ maxSelect: 1, minSelect: 1 });

    const invalid = await request(app)
      .post('/api/option-groups')
      .set('Cookie', adminCookie)
      .send({ name: 'Broken', selectionType: 'MULTIPLE', minSelect: 3, maxSelect: 2 });
    expect(invalid.status).toBe(400);
  });
});
