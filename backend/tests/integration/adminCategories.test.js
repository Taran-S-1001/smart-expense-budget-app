jest.mock('../../src/db', () => ({
  query: jest.fn(),
}));

const request = require('supertest');
const app = require('../../src/app');
const config = require('../../src/config');
const db = require('../../src/db');
const { signTestToken } = require('../../src/auth/jwt');

const TEST_SECRET = 'admin-category-integration-test-secret';
const originalJwtSecret = config.jwtSecret;

const adminAuthHeader = () => `Bearer ${signTestToken('admin-user-01', 'admin')}`;
const userAuthHeader = () => `Bearer ${signTestToken('regular-user-01', 'user')}`;

describe('Admin categories API (S2-04)', () => {
  beforeAll(() => {
    config.jwtSecret = TEST_SECRET;
  });

  afterAll(() => {
    config.jwtSecret = originalJwtSecret;
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('requires authentication before listing predefined categories', async () => {
    const response = await request(app).get('/api/admin/categories');

    expect(response.status).toBe(401);
    expect(response.body.error.code).toBe('MISSING_AUTHORIZATION');
    expect(db.query).not.toHaveBeenCalled();
  });

  it('denies non-admin users access to predefined category routes', async () => {
    const response = await request(app)
      .get('/api/admin/categories')
      .set('Authorization', userAuthHeader());

    expect(response.status).toBe(403);
    expect(response.body.error.code).toBe('FORBIDDEN');
    expect(response.body.error.message).toBe('Access denied: insufficient permissions.');
  });

  it('lists predefined categories for an authenticated admin', async () => {
    db.query.mockResolvedValueOnce({
      rows: [{
        category_id: 'category-1',
        name: 'Groceries',
        type: 'expense',
        is_custom: false,
        user_id: null,
      }],
    });

    const response = await request(app)
      .get('/api/admin/categories?type=expense')
      .set('Authorization', adminAuthHeader());

    expect(response.status).toBe(200);
    expect(response.body.categories).toHaveLength(1);
    expect(response.body.categories[0]).toMatchObject({
      categoryId: 'category-1',
      name: 'Groceries',
      type: 'expense',
      isCustom: false,
      userId: null,
    });
    expect(db.query.mock.calls[0][0]).toContain('user_id IS NULL');
    expect(db.query.mock.calls[0][1]).toEqual(['expense']);
  });

  it('rejects invalid predefined category input before writing to the database', async () => {
    const response = await request(app)
      .post('/api/admin/categories')
      .set('Authorization', adminAuthHeader())
      .send({ name: 'Groceries', type: 'other' });

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('VALIDATION_ERROR');
    expect(db.query).not.toHaveBeenCalled();
  });
});
