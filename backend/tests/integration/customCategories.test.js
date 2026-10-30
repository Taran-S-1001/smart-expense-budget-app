jest.mock('../../src/db', () => ({
  query: jest.fn(),
  getClient: jest.fn(),
}));

const request = require('supertest');
const app = require('../../src/app');
const config = require('../../src/config');
const db = require('../../src/db');
const { signTestToken } = require('../../src/auth/jwt');

const TEST_SECRET = 'custom-category-integration-test-secret';
const originalJwtSecret = config.jwtSecret;
const authorization = () => `Bearer ${signTestToken('user-123', 'User')}`;

describe('Custom categories API (SEBM-F-013, TC-Exp-04)', () => {
  beforeAll(() => {
    config.jwtSecret = TEST_SECRET;
  });

  afterAll(() => {
    config.jwtSecret = originalJwtSecret;
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  const mockClient = (responses) => {
    const client = {
      query: jest.fn(async () => {
        const next = responses.shift();
        if (next instanceof Error) throw next;
        return next || { rows: [] };
      }),
      release: jest.fn(),
    };
    db.getClient.mockResolvedValue(client);
    return client;
  };

  it('creates a custom category owned by the authenticated user', async () => {
    const client = mockClient([
      {}, // BEGIN
      {}, // advisory lock
      { rows: [] }, // duplicate check
      { rows: [{ category_id: 'cat-1', name: 'Pets', type: 'expense' }] },
      {}, // COMMIT
    ]);

    const response = await request(app)
      .post('/api/transactions/categories')
      .set('Authorization', authorization())
      .send({ name: 'Pets', type: 'expense', userId: 'another-user' })
      .expect(201);

    expect(response.body).toEqual({
      category: { categoryId: 'cat-1', name: 'Pets', type: 'expense' },
    });
    const calls = client.query.mock.calls;
    expect(calls[0][0]).toBe('BEGIN');
    expect(calls[1][1]).toEqual(['custom-category:user-123:expense:pets']);
    expect(calls[2][1]).toEqual(['expense', 'Pets', 'user-123']);
    expect(calls[3][1]).toEqual(['user-123', 'Pets', 'expense']);
    expect(calls[4][0]).toBe('COMMIT');
    expect(client.release).toHaveBeenCalledTimes(1);
  });

  it('makes the new category available in the category list used when adding transactions', async () => {
    db.query.mockResolvedValueOnce({
      rows: [
        { category_id: 'cat-1', name: 'Pets', type: 'expense' },
        { category_id: 'cat-2', name: 'Rent', type: 'expense' },
      ],
    });

    const response = await request(app)
      .get('/api/transactions/categories')
      .set('Authorization', authorization())
      .expect(200);

    expect(response.body.categories).toContainEqual({ categoryId: 'cat-1', name: 'Pets', type: 'expense' });
    expect(db.query.mock.calls[0][1]).toEqual(['user-123']);
  });

  it('rejects a duplicate of an existing predefined or own category with 409', async () => {
    const client = mockClient([{}, {}, { rows: [{ category_id: 'cat-existing' }] }]);

    const response = await request(app)
      .post('/api/transactions/categories')
      .set('Authorization', authorization())
      .send({ name: 'rent', type: 'expense' })
      .expect(409);

    expect(response.body.error.code).toBe('CATEGORY_EXISTS');
    expect(client.query.mock.calls.at(-1)[0]).toBe('ROLLBACK');
  });

  it('maps a unique-constraint race to 409', async () => {
    mockClient([
      {},
      {},
      { rows: [] },
      Object.assign(new Error('duplicate key'), { code: '23505' }),
    ]);

    const response = await request(app)
      .post('/api/transactions/categories')
      .set('Authorization', authorization())
      .send({ name: 'Pets', type: 'expense' })
      .expect(409);

    expect(response.body.error.code).toBe('CATEGORY_EXISTS');
  });

  it('rejects invalid input with 400', async () => {
    const response = await request(app)
      .post('/api/transactions/categories')
      .set('Authorization', authorization())
      .send({ name: '', type: 'expense' })
      .expect(400);

    expect(response.body.error.code).toBe('VALIDATION_ERROR');
    expect(db.getClient).not.toHaveBeenCalled();
  });

  it('requires authentication', async () => {
    await request(app).post('/api/transactions/categories').send({ name: 'Pets', type: 'expense' }).expect(401);
  });
});
