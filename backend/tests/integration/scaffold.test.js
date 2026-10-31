const request = require('supertest');
const app = require('../../src/app');

describe('Backend Scaffold & Routing (Integration)', () => {
  it('returns 404 standardized envelope for non-existent routes', async () => {
    const response = await request(app).get('/api/does-not-exist');

    expect(response.status).toBe(404);
    expect(response.body).toHaveProperty('error');
    expect(response.body.error).toHaveProperty('code', 'NOT_FOUND');
    expect(response.body.error.message).toContain('/api/does-not-exist');
  });

  it('mounts all required modular monolith routers under /api', async () => {
    const moduleRoutes = [
      { prefix: '/api/auth', status: 404 },
      { prefix: '/api/transactions', status: 401 },
      { prefix: '/api/budgets', status: 404 },
      { prefix: '/api/accounts', status: 401 },
      { prefix: '/api/reports', status: 404 },
      { prefix: '/api/notifications', status: 404 },
      { prefix: '/api/admin', status: 401 },
      { prefix: '/api/receipts', status: 401 },
      { prefix: '/api/reminders', status: 401 },
    ];

    for (const { prefix, status } of moduleRoutes) {
      const response = await request(app).get(prefix);
      expect(response.status).toBe(status);
      expect(response.body).toHaveProperty('error');
      expect(response.body.error.code).toBe(status === 401 ? 'MISSING_AUTHORIZATION' : 'NOT_FOUND');
    }
  });
});
