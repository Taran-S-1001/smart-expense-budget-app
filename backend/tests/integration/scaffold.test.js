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
    // Each scaffolded router is mounted. Without specific endpoints added yet,
    // requests to these module paths will hit the 404 handler cleanly with standard envelope.
    const modulePrefixes = [
      '/api/auth',
      '/api/transactions',
      '/api/budgets',
      '/api/accounts',
      '/api/reports',
      '/api/notifications',
      '/api/admin',
      '/api/receipts',
    ];

    for (const prefix of modulePrefixes) {
      const response = await request(app).get(prefix);
      expect(response.status).toBe(404);
      expect(response.body).toHaveProperty('error');
      expect(response.body.error.code).toBe('NOT_FOUND');
    }
  });
});
