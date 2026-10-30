const request = require('supertest');
const app = require('../../src/app');
const config = require('../../src/config');
const { getPool, closePool } = require('../../src/db');
const { signTestToken } = require('../../src/auth/jwt');

const TEST_SECRET = 'admin-db-regression-secret';
const originalJwtSecret = config.jwtSecret;

describe('Admin category real-database safeguards (S2-04)', () => {
  let pool;
  let adminUserId;
  let accountId;
  let categoryId;

  beforeAll(async () => {
    config.jwtSecret = TEST_SECRET;
    pool = getPool();

    const uniqueEmail = `admin.category.${Date.now()}@example.com`;
    const userRes = await pool.query(
      `INSERT INTO users (name, email, password_hash, role)
       VALUES ('Admin Category Tester', $1, 'hashed-pass', 'admin')
       RETURNING user_id;`,
      [uniqueEmail],
    );
    adminUserId = userRes.rows[0].user_id;

    const categoryRes = await pool.query(
      `INSERT INTO categories (user_id, name, type, is_custom)
       VALUES (NULL, 'Protected Travel', 'expense', FALSE)
       RETURNING category_id;`,
    );
    categoryId = categoryRes.rows[0].category_id;

    const accountRes = await pool.query(
      `INSERT INTO accounts (user_id, account_name, account_type, balance)
       VALUES ($1, 'Admin test account', 'checking', 1000.00)
       RETURNING account_id;`,
      [adminUserId],
    );
    accountId = accountRes.rows[0].account_id;

    await pool.query(
      `INSERT INTO transactions (account_id, category_id, amount, date, type, notes)
       VALUES ($1, $2, 42.00, '2026-11-10', 'expense', 'Admin category dependency');`,
      [accountId, categoryId],
    );

    await pool.query(
      `INSERT INTO budgets (user_id, category_id, period, limit_amount, alert_threshold)
       VALUES ($1, $2, '2026-11', 500.00, 80.00);`,
      [adminUserId, categoryId],
    );
  });

  afterAll(async () => {
    try {
      if (adminUserId) {
        const poolForCleanup = getPool();
        await poolForCleanup.query('DELETE FROM budgets WHERE user_id = $1;', [adminUserId]);
        await poolForCleanup.query('DELETE FROM transactions WHERE account_id = $1;', [accountId]);
        await poolForCleanup.query('DELETE FROM accounts WHERE user_id = $1;', [adminUserId]);
        await poolForCleanup.query('DELETE FROM categories WHERE category_id = $1;', [categoryId]);
        await poolForCleanup.query('DELETE FROM users WHERE user_id = $1;', [adminUserId]);
      }
    } finally {
      await closePool();
      config.jwtSecret = originalJwtSecret;
    }
  });

  it('returns 409 when an admin tries to switch a category type while it is still in use', async () => {
    const response = await request(app)
      .put(`/api/admin/categories/${categoryId}`)
      .set('Authorization', `Bearer ${signTestToken(adminUserId, 'admin')}`)
      .send({ name: 'Protected Travel', type: 'income' });

    expect(response.status).toBe(409);
    expect(response.body.error.code).toBe('CATEGORY_IN_USE');
  });

  it('returns 409 when an admin tries to delete a category tied to a budget or transaction', async () => {
    const response = await request(app)
      .delete(`/api/admin/categories/${categoryId}`)
      .set('Authorization', `Bearer ${signTestToken(adminUserId, 'admin')}`);

    expect(response.status).toBe(409);
    expect(response.body.error.code).toBe('CATEGORY_IN_USE');
  });
});
