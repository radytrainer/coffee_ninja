import jwt from 'jsonwebtoken';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ADMIN, STAFF, app, loginAs, prisma, resetDatabase } from './helpers';

beforeAll(async () => {
  await resetDatabase();
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe('login', () => {
  it('logs in and sets a secure httpOnly session cookie', async () => {
    const res = await request(app).post('/api/auth/login').send(ADMIN);
    expect(res.status).toBe(200);
    expect(res.body.data.user).toMatchObject({ email: ADMIN.email, role: 'ADMIN' });
    expect(res.body.data.user.passwordHash).toBeUndefined();
    const cookie = (res.headers['set-cookie'] as unknown as string[])[0]!;
    expect(cookie).toMatch(/^gcs_session=/);
    expect(cookie).toMatch(/HttpOnly/i);
    expect(cookie).toMatch(/SameSite=Lax/i);
  });

  it('is case-insensitive for email', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: STAFF.email.toUpperCase(), password: STAFF.password });
    expect(res.status).toBe(200);
  });

  it('returns the same error for wrong password and unknown email', async () => {
    const wrong = await request(app)
      .post('/api/auth/login')
      .send({ ...ADMIN, password: 'nope-nope-1' });
    const unknown = await request(app)
      .post('/api/auth/login')
      .send({ email: 'ghost@test.local', password: 'x1234567' });
    expect(wrong.status).toBe(401);
    expect(unknown.status).toBe(401);
    expect(wrong.body.error.message).toBe(unknown.body.error.message);
  });

  it('validates the login body', async () => {
    const res = await request(app).post('/api/auth/login').send({ email: 'not-an-email' });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('stores passwords as bcrypt hashes, never plaintext', async () => {
    const user = await prisma.user.findUniqueOrThrow({ where: { email: ADMIN.email } });
    expect(user.passwordHash).not.toContain(ADMIN.password);
    expect(user.passwordHash).toMatch(/^\$2[aby]\$/);
  });
});

describe('session', () => {
  it('GET /me works with cookie and Bearer token', async () => {
    const cookie = await loginAs(STAFF);
    const viaCookie = await request(app).get('/api/auth/me').set('Cookie', cookie);
    expect(viaCookie.body.data.email).toBe(STAFF.email);

    const login = await request(app).post('/api/auth/login').send(STAFF);
    const viaBearer = await request(app)
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${login.body.data.token}`);
    expect(viaBearer.status).toBe(200);
  });

  it('rejects missing, tampered and expired tokens', async () => {
    expect((await request(app).get('/api/auth/me')).status).toBe(401);

    const login = await request(app).post('/api/auth/login').send(STAFF);
    const token = login.body.data.token as string;
    const [h, p, s] = token.split('.');
    const forgedPayload = Buffer.from(
      JSON.stringify({ ...JSON.parse(Buffer.from(p!, 'base64url').toString()), role: 'ADMIN' }),
    ).toString('base64url');
    const forged = await request(app)
      .get('/api/users')
      .set('Authorization', `Bearer ${h}.${forgedPayload}.${s}`);
    expect(forged.status).toBe(401);

    const user = await prisma.user.findUniqueOrThrow({ where: { email: STAFF.email } });
    const expired = jwt.sign(
      { sub: user.id, role: 'STAFF', ver: user.sessionVersion },
      process.env.JWT_SECRET!,
      {
        expiresIn: -10,
        issuer: 'gesture-coffee-shop',
      },
    );
    expect(
      (await request(app).get('/api/auth/me').set('Authorization', `Bearer ${expired}`)).status,
    ).toBe(401);

    const wrongSecret = jwt.sign(
      { sub: user.id, role: 'STAFF', ver: user.sessionVersion },
      'another-secret-another-secret-123',
      {
        issuer: 'gesture-coffee-shop',
      },
    );
    expect(
      (await request(app).get('/api/auth/me').set('Authorization', `Bearer ${wrongSecret}`)).status,
    ).toBe(401);
  });

  it('logout clears the cookie and revokes the token', async () => {
    const login = await request(app).post('/api/auth/login').send(STAFF);
    const token = login.body.data.token as string;
    const logout = await request(app)
      .post('/api/auth/logout')
      .set('Authorization', `Bearer ${token}`);
    expect(logout.status).toBe(200);
    expect((logout.headers['set-cookie'] as unknown as string[])[0]).toMatch(/gcs_session=;/);
    expect(
      (await request(app).get('/api/auth/me').set('Authorization', `Bearer ${token}`)).status,
    ).toBe(401);
    // A fresh login works again.
    expect(
      (
        await request(app)
          .get('/api/auth/me')
          .set('Cookie', await loginAs(STAFF))
      ).status,
    ).toBe(200);
  });
});

describe('role-based authorization', () => {
  let adminCookie: string;
  let staffCookie: string;

  beforeAll(async () => {
    adminCookie = await loginAs(ADMIN);
    staffCookie = await loginAs(STAFF);
  });

  it('staff can manage orders but not admin resources', async () => {
    expect((await request(app).get('/api/orders').set('Cookie', staffCookie)).status).toBe(200);
    expect((await request(app).get('/api/users').set('Cookie', staffCookie)).status).toBe(403);
    expect(
      (await request(app).post('/api/products').set('Cookie', staffCookie).send({})).status,
    ).toBe(403);
  });

  it('admin manages staff accounts with password policy', async () => {
    const weak = await request(app)
      .post('/api/users')
      .set('Cookie', adminCookie)
      .send({ email: 'new@test.local', name: 'New Barista', password: 'short' });
    expect(weak.status).toBe(400);

    const created = await request(app)
      .post('/api/users')
      .set('Cookie', adminCookie)
      .send({ email: 'New@Test.local', name: 'New Barista', password: 'Coffee1234' });
    expect(created.status).toBe(201);
    expect(created.body.data).toMatchObject({
      email: 'new@test.local',
      role: 'STAFF',
      active: true,
    });

    const duplicate = await request(app)
      .post('/api/users')
      .set('Cookie', adminCookie)
      .send({ email: 'new@test.local', name: 'Dup', password: 'Coffee1234' });
    expect(duplicate.status).toBe(409);

    const newCookie = await loginAs({ email: 'new@test.local', password: 'Coffee1234' });
    const id = created.body.data.id as string;
    const deactivated = await request(app)
      .put(`/api/users/${id}`)
      .set('Cookie', adminCookie)
      .send({ active: false });
    expect(deactivated.body.data.active).toBe(false);
    // Existing session is revoked and login is refused.
    expect((await request(app).get('/api/auth/me').set('Cookie', newCookie)).status).toBe(401);
    expect(
      (
        await request(app)
          .post('/api/auth/login')
          .send({ email: 'new@test.local', password: 'Coffee1234' })
      ).status,
    ).toBe(401);

    expect((await request(app).delete(`/api/users/${id}`).set('Cookie', adminCookie)).status).toBe(
      200,
    );
  });

  it('protects against removing the last admin or yourself', async () => {
    const admin = await prisma.user.findUniqueOrThrow({ where: { email: ADMIN.email } });
    const self = await request(app).delete(`/api/users/${admin.id}`).set('Cookie', adminCookie);
    expect(self.status).toBe(400);
    const demote = await request(app)
      .put(`/api/users/${admin.id}`)
      .set('Cookie', adminCookie)
      .send({ role: 'STAFF' });
    expect(demote.status).toBe(400);
  });
});
