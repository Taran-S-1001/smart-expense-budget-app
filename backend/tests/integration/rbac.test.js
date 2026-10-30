const express = require('express');
const request = require('supertest');
const config = require('../../src/config');
const { authenticateToken, signTestToken } = require('../../src/auth/jwt');
const { requireRole } = require('../../src/middleware');

const TEST_SECRET = 'test-secret-for-rbac-integration-tests';
const originalJwtSecret = config.jwtSecret;

// Build a dummy Express app to test the authentication and RBAC middleware chain
const app = express();
app.use(express.json());

// Dummy protected route per S2-03 specification
app.get('/api/admin/dummy-protected', authenticateToken, requireRole('Admin'), (req, res) => {
  res.status(200).json({
    success: true,
    message: 'Admin access granted.',
    user: req.user,
  });
});

describe('TC-Sec-06: RBAC middleware for admin endpoints (SEBM-SR-005, Issue #28)', () => {
  // AC-SEBM-SR-005: Non-admin accounts are denied access to admin endpoints/screens. Test: TC-Sec-06
  beforeAll(() => {
    config.jwtSecret = TEST_SECRET;
  });

  afterAll(() => {
    config.jwtSecret = originalJwtSecret;
  });

  it('allows an authenticated user with admin role to access the protected admin route', async () => {
    const adminToken = signTestToken('admin-user-01', 'admin');
    const response = await request(app)
      .get('/api/admin/dummy-protected')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.user).toEqual({
      userId: 'admin-user-01',
      role: 'admin',
    });
  });

  it('denies an authenticated user with user role with 403 Forbidden', async () => {
    const userToken = signTestToken('normal-user-01', 'user');
    const response = await request(app)
      .get('/api/admin/dummy-protected')
      .set('Authorization', `Bearer ${userToken}`);

    expect(response.status).toBe(403);
    expect(response.body).toEqual({
      error: {
        code: 'FORBIDDEN',
        message: 'Access denied: insufficient permissions.',
      },
    });
  });

  it('rejects unauthenticated requests without authorization header with 401 Unauthorized', async () => {
    const response = await request(app).get('/api/admin/dummy-protected');

    expect(response.status).toBe(401);
    expect(response.body.error.code).toBe('MISSING_AUTHORIZATION');
    expect(response.body.error.message).toBeDefined();
  });

  it('rejects requests with an invalid bearer token with 401 Unauthorized', async () => {
    const response = await request(app)
      .get('/api/admin/dummy-protected')
      .set('Authorization', 'Bearer invalid.token.payload');

    expect(response.status).toBe(401);
    expect(response.body.error.code).toBe('INVALID_TOKEN');
    expect(response.body.error.message).toBeDefined();
  });

  it('rejects requests with wrong authorization scheme with 401 Unauthorized', async () => {
    const response = await request(app)
      .get('/api/admin/dummy-protected')
      .set('Authorization', 'Basic dXNlcjpwYXNz');

    expect(response.status).toBe(401);
    expect(response.body.error.code).toBe('INVALID_AUTHORIZATION');
    expect(response.body.error.message).toBeDefined();
  });
});
