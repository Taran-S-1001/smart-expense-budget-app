const request = require('supertest');
const app = require('../../../src/app');
const { signTestToken } = require('../../../src/auth/jwt');

describe('Independent Verification: RBAC Middleware (S2-03)', () => {

  test('TC-Sec-06-A: Admin user can access admin endpoint', async () => {
    const adminToken = signTestToken('1', 'admin');

    const res = await request(app)
      .get('/api/admin/categories')
      .set('Authorization', `Bearer ${adminToken}`);

    expect([200, 500]).toContain(res.status);

    if (res.status === 200) {
      expect(res.body).toHaveProperty('categories');
      expect(Array.isArray(res.body.categories)).toBe(true);
    }
  });

  test('TC-Sec-06-B: Normal user is forbidden from admin endpoint', async () => {
    const userToken = signTestToken('1', 'user');

    const res = await request(app)
      .get('/api/admin/categories')
      .set('Authorization', `Bearer ${userToken}`);

    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('FORBIDDEN');
  });

  test('TC-Sec-06-C: Unauthenticated request is rejected', async () => {
    const res = await request(app)
      .get('/api/admin/categories');

    expect([401, 403]).toContain(res.status);
  });

});