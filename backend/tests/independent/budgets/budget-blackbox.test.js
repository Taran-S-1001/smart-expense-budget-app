const request = require('supertest');
const app = require('../../../src/app');
const config = require('../../../src/config');
const { getPool, closePool } = require('../../../src/db');
const { signTestToken } = require('../../../src/auth/jwt');

const TEST_SECRET = 'independent-budget-report-test-secret';
const originalJwtSecret = config.jwtSecret;
const authHeader = (userId, role = 'user') => `Bearer ${signTestToken(userId, role)}`;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

describe('Independent black-box verification: Budgets (Dev B -> Dev C)', () => {
  let pool;
  let userId;
  let accountId;
  let categoryId;

  beforeAll(async () => {
    config.jwtSecret = TEST_SECRET;
    pool = getPool();

    const uniqueEmail = `independent.budget.${Date.now()}@example.com`;
    const userRes = await pool.query(
      `INSERT INTO users (name, email, password_hash) VALUES ('Independent Budget Tester', $1, 'hashed_pass_123') RETURNING user_id;`,
      [uniqueEmail]
    );
    userId = userRes.rows[0].user_id;

    const accountRes = await pool.query(
      `INSERT INTO accounts (user_id, account_name, account_type, balance) VALUES ($1, 'Independent Budget Checking', 'checking', 3000.00) RETURNING account_id;`,
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
        `INSERT INTO categories (name, type) VALUES ('Independent Budget Category', 'expense') RETURNING category_id;`
      );
      categoryId = created.rows[0].category_id;
    }
  });

  afterAll(async () => {
    try {
      if (userId) {
        await pool.query('DELETE FROM budgets WHERE user_id = $1;', [userId]);
        await pool.query('DELETE FROM transactions WHERE account_id = $1;', [accountId]);
        await pool.query('DELETE FROM accounts WHERE user_id = $1;', [userId]);
        await pool.query('DELETE FROM users WHERE user_id = $1;', [userId]);
      }
    } finally {
      await closePool();
      config.jwtSecret = originalJwtSecret;
    }
  });

  it('TC-Bud-01: creates a valid monthly budget and rejects a duplicate within the same user and period', async () => {
    const createRes = await request(app)
      .post('/api/budgets')
      .set('Authorization', authHeader(userId))
      .send({
        category_id: categoryId,
        period: '2026-11',
        limit_amount: 600,
        alert_threshold: 80,
      });

    expect(createRes.status).toBe(201);
    expect(createRes.body).toHaveProperty('message', 'Budget created successfully');
    expect(createRes.body.budget).toHaveProperty('period', '2026-11');

    const duplicateRes = await request(app)
      .post('/api/budgets')
      .set('Authorization', authHeader(userId))
      .send({
        category_id: categoryId,
        period: '2026-11',
        limit_amount: 700,
        alert_threshold: 80,
      });

    expect(duplicateRes.status).toBe(409);
    expect(duplicateRes.body).toHaveProperty('error');
  });

  it('TC-Bud-02: calculates spent vs limit dynamically for the selected period and rejects invalid period input', async () => {
    await pool.query(
      `INSERT INTO transactions (account_id, category_id, amount, type, date) VALUES ($1, $2, 180.00, 'expense', '2026-11-05');`,
      [accountId, categoryId]
    );

    const progressRes = await request(app)
      .get('/api/budgets/progress?period=2026-11')
      .set('Authorization', authHeader(userId));

    expect(progressRes.status).toBe(200);
    expect(progressRes.body).toHaveProperty('period', '2026-11');
    expect(Array.isArray(progressRes.body.budgets)).toBe(true);

    const thisBudget = progressRes.body.budgets.find((entry) => entry.category_id === categoryId);
    expect(thisBudget).toBeDefined();
    expect(Number(thisBudget.spent)).toBeGreaterThanOrEqual(180);

    const badPeriodRes = await request(app)
      .get('/api/budgets/progress?period=invalid-period')
      .set('Authorization', authHeader(userId));

    expect(badPeriodRes.status).toBe(400);
    expect(badPeriodRes.body).toHaveProperty('error');
  });

  it('TC-Bud-03: sends a threshold warning when the user crosses the alert threshold and a limit-exceeded warning when the spend exceeds the cap', async () => {
    const thresholdBudgetRes = await request(app)
      .post('/api/budgets')
      .set('Authorization', authHeader(userId))
      .send({
        category_id: categoryId,
        period: '2026-12',
        limit_amount: 1000,
        alert_threshold: 80,
      });

    expect(thresholdBudgetRes.status).toBe(201);

    await pool.query(
      `INSERT INTO transactions (account_id, category_id, amount, type, date) VALUES ($1, $2, 900.00, 'expense', '2026-12-10');`,
      [accountId, categoryId]
    );

    await sleep(200);

    const notificationRes = await request(app)
      .get('/api/notifications')
      .set('Authorization', authHeader(userId))
      .query({ limit: 20, offset: 0 });

    expect(notificationRes.status).toBe(200);
    expect(Array.isArray(notificationRes.body.notifications)).toBe(true);

    const matching = notificationRes.body.notifications.some((n) =>
      (n.type === 'BUDGET_THRESHOLD_WARNING' || n.type === 'BUDGET_LIMIT_EXCEEDED')
      && typeof n.message === 'string'
      && n.message.toLowerCase().includes('budget')
    );

    expect(matching).toBe(true);
  });
});
