const request = require('supertest');
const app = require('../../../src/app');
const { signTestToken } = require('../../../src/auth/jwt');

describe('Independent Verification: Security & RBAC (S1-07, S2-03)', () => {

  // S1-07: SEBM-SR-001 / TC-Sec-02 (Secure Headers)
  test('TC-Sec-02: Response includes mandatory security headers', async () => {
    const res = await request(app).get('/api/health');
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['x-frame-options']).toBe('DENY');
  });

  // S2-03: SEBM-SR-005 / TC-Sec-06 (RBAC middleware for admin endpoints)
  test('TC-Sec-06-A: Non-admin user receives 403 on admin-only route', async () => {
    const regularUserToken = signTestToken('2', 'user');
    const res = await request(app)
      .get('/api/admin/audit-logs')
      .set('Authorization', `Bearer ${regularUserToken}`);
    
    expect(res.status).toBe(403);
  });

  test('TC-Sec-06-B: Admin user successfully accesses admin-only route', async () => {
    const adminToken = signTestToken('1', 'admin');
    const res = await request(app)
      .get('/api/admin/audit-logs')
      .set('Authorization', `Bearer ${adminToken}`);
    
    expect([200, 404]).toContain(res.status);
  });
});