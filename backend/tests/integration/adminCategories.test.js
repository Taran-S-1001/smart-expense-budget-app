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

const adminAuthorization = () => `Bearer ${signTestToken('admin-123', 'admin')}`;
const userAuthorization = () => `Bearer ${signTestToken('user-123', 'user')}`;

describe('Admin predefined categories API (S2-04)', () => {
  beforeAll(() => {
    config.jwtSecret = TEST_SECRET;
  });

  afterAll(() => {
    config.jwtSecret = originalJwtSecret;
  });

  beforeEach(() => {
    jest.clearAllMocks();
    db.query.mockReset();
  });

  it('requires an admin role to manage predefined categories', async () => {
    const response = await request(app)
      .get('/api/admin/categories')
      .set('Authorization', userAuthorization())
      .expect(403);

    expect(response.body.error.code).toBe('FORBIDDEN');
    expect(db.query).not.toHaveBeenCalled();
  });

  it('lists predefined categories with an optional type filter', async () => {
    db.query.mockImplementation((sql, params) => {
      if (params && params[0] === 'expense') {
        return Promise.resolve({
          rows: [{
            category_id: 'cat-1',
            name: 'Groceries',
            type: 'expense',
            is_custom: false,
            user_id: null,
          }],
        });
      }

      return Promise.resolve({
        rows: [
          {
            category_id: 'cat-1',
            name: 'Groceries',
            type: 'expense',
            is_custom: false,
            user_id: null,
          },
          {
            category_id: 'cat-2',
            name: 'Salary',
            type: 'income',
            is_custom: false,
            user_id: null,
          },
        ],
      });
    });

    const response = await request(app)
      .get('/api/admin/categories?type=expense')
      .set('Authorization', adminAuthorization())
      .expect(200);

    expect(response.body.categories).toEqual([
      {
        categoryId: 'cat-1',
        name: 'Groceries',
        type: 'expense',
        isCustom: false,
        userId: null,
      },
    ]);
    expect(db.query.mock.calls[0][0]).toContain('WHERE user_id IS NULL');
    expect(db.query.mock.calls[0][1]).toEqual(['expense']);
  });

  it('creates a predefined category for admins only', async () => {
    db.query
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({
        rows: [{
          category_id: 'cat-3',
          name: 'Travel',
          type: 'expense',
          is_custom: false,
          user_id: null,
        }],
      });

    const response = await request(app)
      .post('/api/admin/categories')
      .set('Authorization', adminAuthorization())
      .send({ name: 'Travel', type: 'expense' })
      .expect(201);

    expect(response.body.message).toBe('Predefined category created successfully.');
    expect(response.body.category).toMatchObject({
      categoryId: 'cat-3',
      name: 'Travel',
      type: 'expense',
      isCustom: false,
      userId: null,
    });
  });

  it('updates and deletes predefined categories without touching custom user categories', async () => {
    db.query
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({
        rows: [{
          category_id: 'cat-4',
          name: 'Utilities',
          type: 'expense',
          is_custom: false,
          user_id: null,
        }],
      });

    const updateResponse = await request(app)
      .put('/api/admin/categories/cat-4')
      .set('Authorization', adminAuthorization())
      .send({ name: 'Utilities', type: 'expense' })
      .expect(200);

    expect(updateResponse.body.category).toMatchObject({
      categoryId: 'cat-4',
      name: 'Utilities',
      type: 'expense',
    });

    db.query.mockReset();
    db.query.mockResolvedValueOnce({
      rows: [{ category_id: 'cat-4' }],
    });

    const deleteResponse = await request(app)
      .delete('/api/admin/categories/cat-4')
      .set('Authorization', adminAuthorization())
      .expect(200);

    expect(deleteResponse.body.message).toBe('Predefined category deleted successfully.');
  });
});
