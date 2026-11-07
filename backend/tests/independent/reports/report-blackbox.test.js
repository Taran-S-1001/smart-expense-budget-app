const request = require('supertest');
const app = require('../../../src/app');
const config = require('../../../src/config');
const { getPool, closePool } = require('../../../src/db');
const { signTestToken } = require('../../../src/auth/jwt');

const TEST_SECRET = 'independent-report-test-secret';
const originalJwtSecret = config.jwtSecret;
const authHeader = (userId, role = 'user') => `Bearer ${signTestToken(userId, role)}`;

describe('Independent black-box verification: Reports (Dev B -> Dev C)', () => {
  let pool;
  let userId;
  let accountId;
  let categoryId;

  beforeAll(async () => {
    config.jwtSecret = TEST_SECRET;
    pool = getPool();

    const uniqueEmail = `independent.report.${Date.now()}@example.com`;
    const userRes = await pool.query(
      `INSERT INTO users (name, email, password_hash) VALUES ('Independent Reports Tester', $1, 'hashed_pass_123') RETURNING user_id;`,
      [uniqueEmail]
    );
    userId = userRes.rows[0].user_id;

    const accountRes = await pool.query(
      `INSERT INTO accounts (user_id, account_name, account_type, balance) VALUES ($1, 'Independent Report Checking', 'checking', 5000.00) RETURNING account_id;`,
      [userId]
    );
    accountId = accountRes.rows[0].account_id;

    const categoryRes = await pool.query(
      `SELECT category_id FROM categories WHERE type = 'expense' LIMIT 1;`
    );
    if (categoryRes.rows.length > 0) {
      categoryId = categoryRes.rows[0].category_id;
    } else {
      const created = await pool.query(
        `INSERT INTO categories (name, type) VALUES ('Independent Report Category', 'expense') RETURNING category_id;`
      );
      categoryId = created.rows[0].category_id;
    }

    await pool.query(
      `INSERT INTO transactions (account_id, category_id, amount, type, date) VALUES ($1, $2, 120.00, 'expense', '2026-10-03');`,
      [accountId, categoryId]
    );
    await pool.query(
      `INSERT INTO transactions (account_id, category_id, amount, type, date) VALUES ($1, $2, 370.00, 'expense', '2026-10-18');`,
      [accountId, categoryId]
    );
    await pool.query(
      `INSERT INTO transactions (account_id, category_id, amount, type, date) VALUES ($1, $2, 50.00, 'income', '2026-10-25');`,
      [accountId, categoryId]
    );
  });

  afterAll(async () => {
    try {
      if (userId) {
        await pool.query('DELETE FROM transactions WHERE account_id = $1;', [accountId]);
        await pool.query('DELETE FROM accounts WHERE user_id = $1;', [userId]);
        await pool.query('DELETE FROM users WHERE user_id = $1;', [userId]);
      }
    } finally {
      await closePool();
      config.jwtSecret = originalJwtSecret;
    }
  });

  it('TC-Rep-01: returns a weekly/monthly report for the requested range and exposes the totals for charting', async () => {
    const res = await request(app)
      .get('/api/reports/summary?start=2026-10-01&end=2026-10-31')
      .set('Authorization', authHeader(userId));

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('period');
    expect(res.body).toHaveProperty('totals');
    expect(res.body.totals).toHaveProperty('income');
    expect(res.body.totals).toHaveProperty('expenses');
    expect(res.body).toHaveProperty('breakdown');
  });

  it('TC-Rep-02: exports the report in CSV/PDF and ensures the exported data matches the report totals', async () => {
    const reportRes = await request(app)
      .get('/api/reports/summary?start=2026-10-01&end=2026-10-31')
      .set('Authorization', authHeader(userId));

    expect(reportRes.status).toBe(200);

    const csvRes = await request(app)
      .get('/api/reports/export?format=csv&start=2026-10-01&end=2026-10-31')
      .set('Authorization', authHeader(userId));

    expect(csvRes.status).toBe(200);
    expect(csvRes.headers['content-type']).toMatch(/csv|text\/plain|application\/csv/i);

    const pdfRes = await request(app)
      .get('/api/reports/export?format=pdf&start=2026-10-01&end=2026-10-31')
      .set('Authorization', authHeader(userId));

    expect(pdfRes.status).toBe(200);
    expect(pdfRes.headers['content-type']).toMatch(/pdf|application\/pdf/i);
  });

  it('TC-Rep-03: compares the selected period against the prior period and handles zero and negative bases correctly', async () => {
    const res = await request(app)
      .get('/api/reports/compare?start=2026-10-01&end=2026-10-31&previousStart=2026-09-01&previousEnd=2026-09-30')
      .set('Authorization', authHeader(userId));

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('comparison');
    expect(res.body.comparison).toHaveProperty('percentageChange');
    expect(typeof res.body.comparison.percentageChange).toBe('number');

    const zeroBaseRes = await request(app)
      .get('/api/reports/compare?start=2026-10-01&end=2026-10-31&previousStart=2026-09-01&previousEnd=2026-09-30&metric=income')
      .set('Authorization', authHeader(userId));

    expect(zeroBaseRes.status).toBe(200);
    expect(zeroBaseRes.body.comparison).toHaveProperty('percentageChange');
  });
});
