const config = require('../../src/config');
const request = require('supertest');
const app = require('../../src/app');
const { getPool, closePool } = require('../../src/db');

const originalJwtSecret = config.jwtSecret;

describe('S2-05: edit and delete transactions on PostgreSQL (SEBM-F-011, TC-Exp-02)', () => {
  const stamp = Date.now();
  const password = 'S2-05-Test-Password-2026!';
  const emails = [`s205-a-${stamp}@example.com`, `s205-b-${stamp}@example.com`];
  const users = [];

  const signUp = async (email) => {
    await request(app).post('/api/auth/register').send({ name: 'S2-05 Test', email, password }).expect(201);
    const login = await request(app).post('/api/auth/login').send({ email, password }).expect(200);
    return { auth: { Authorization: `Bearer ${login.body.token}` } };
  };

  const createAccount = async (user, accountName, openingBalance) => {
    const response = await request(app)
      .post('/api/accounts')
      .set(user.auth)
      .send({ accountName, accountType: 'checking', openingBalance })
      .expect(201);
    return response.body.account.accountId;
  };

  const balanceOf = async (user, accountId) => {
    const response = await request(app).get('/api/accounts').set(user.auth).expect(200);
    return response.body.accounts.find((account) => account.accountId === accountId).balance;
  };

  const record = async (user, payload) =>
    (await request(app).post('/api/transactions').set(user.auth).send(payload).expect(201)).body;

  let owner;
  let other;
  let expenseCategory;
  let expenseCategory2;
  let incomeCategory;
  const today = new Date().toISOString().slice(0, 10);

  beforeAll(async () => {
    config.jwtSecret = 's2-05-integration-test-secret';
    owner = await signUp(emails[0]);
    other = await signUp(emails[1]);
    users.push(owner, other);
    const categories = (await request(app).get('/api/transactions/categories').set(owner.auth).expect(200))
      .body.categories;
    const expenses = categories.filter((category) => category.type === 'expense');
    expenseCategory = expenses[0].categoryId;
    expenseCategory2 = expenses[1].categoryId;
    incomeCategory = categories.find((category) => category.type === 'income').categoryId;
  });

  afterAll(async () => {
    const pool = getPool();
    try {
      await pool.query(
        `DELETE FROM transactions WHERE account_id IN (
           SELECT account_id FROM accounts WHERE user_id IN (SELECT user_id FROM users WHERE email = ANY($1)))`,
        [emails],
      );
      await pool.query(
        'DELETE FROM accounts WHERE user_id IN (SELECT user_id FROM users WHERE email = ANY($1))',
        [emails],
      );
      await pool.query('DELETE FROM users WHERE email = ANY($1)', [emails]);
    } finally {
      config.jwtSecret = originalJwtSecret;
      await closePool();
    }
  });

  it('reverses and reapplies the balance when the amount changes', async () => {
    const accountId = await createAccount(owner, 'Edit amount', 1000);
    const created = await record(owner, {
      accountId, categoryId: expenseCategory, amount: 100, type: 'expense', date: today,
    });
    expect(created.newBalance).toBe(900);

    const edited = await request(app)
      .put(`/api/transactions/${created.transactionId}`)
      .set(owner.auth)
      .send({ accountId, categoryId: expenseCategory2, amount: 40.5, type: 'expense', date: today, notes: ' edited ' })
      .expect(200);

    expect(edited.body).toMatchObject({
      transactionId: created.transactionId, categoryId: expenseCategory2, amount: 40.5, notes: 'edited', newBalance: 959.5,
    });
    expect(await balanceOf(owner, accountId)).toBe(959.5);

    const list = (await request(app).get('/api/transactions').set(owner.auth).expect(200)).body.transactions;
    expect(list.find((item) => item.transactionId === created.transactionId)).toMatchObject({
      amount: 40.5, categoryId: expenseCategory2,
    });
  });

  it('keeps the calendar date unchanged through create, list and edit', async () => {
    const accountId = await createAccount(owner, 'Dates', 100);
    const created = await record(owner, {
      accountId, categoryId: expenseCategory, amount: 1, type: 'expense', date: '2026-10-28',
    });
    expect(created.date).toBe('2026-10-28');

    const edited = await request(app)
      .put(`/api/transactions/${created.transactionId}`)
      .set(owner.auth)
      .send({ accountId, categoryId: expenseCategory, amount: 2, type: 'expense', date: '2026-10-28' })
      .expect(200);
    expect(edited.body.date).toBe('2026-10-28');

    const list = (await request(app).get('/api/transactions').set(owner.auth).expect(200)).body.transactions;
    expect(list.find((item) => item.transactionId === created.transactionId).date).toBe('2026-10-28');
  });

  it('handles a change of type and a move to another account', async () => {
    const from = await createAccount(owner, 'Move from', 500);
    const to = await createAccount(owner, 'Move to', 200);
    const created = await record(owner, {
      accountId: from, categoryId: expenseCategory, amount: 50, type: 'expense', date: today,
    });
    expect(await balanceOf(owner, from)).toBe(450);

    const moved = await request(app)
      .put(`/api/transactions/${created.transactionId}`)
      .set(owner.auth)
      .send({ accountId: to, categoryId: incomeCategory, amount: 30, type: 'income', date: today })
      .expect(200);

    expect(moved.body).toMatchObject({
      accountId: to, newBalance: 230, previousAccountId: from, previousAccountBalance: 500,
    });
    expect(await balanceOf(owner, from)).toBe(500);
    expect(await balanceOf(owner, to)).toBe(230);
  });

  it('restores the balance when a transaction is deleted', async () => {
    const accountId = await createAccount(owner, 'Delete', 300);
    const expense = await record(owner, {
      accountId, categoryId: expenseCategory, amount: 75.25, type: 'expense', date: today,
    });
    const income = await record(owner, {
      accountId, categoryId: incomeCategory, amount: 10, type: 'income', date: today,
    });
    expect(await balanceOf(owner, accountId)).toBe(234.75);

    const removed = await request(app).delete(`/api/transactions/${expense.transactionId}`).set(owner.auth).expect(200);
    expect(removed.body).toEqual({ transactionId: expense.transactionId, accountId, newBalance: 310 });

    await request(app).delete(`/api/transactions/${income.transactionId}`).set(owner.auth).expect(200);
    expect(await balanceOf(owner, accountId)).toBe(300);

    const list = (await request(app).get('/api/transactions').set(owner.auth).expect(200)).body.transactions;
    expect(list.some((item) => item.transactionId === expense.transactionId)).toBe(false);
    await request(app).delete(`/api/transactions/${expense.transactionId}`).set(owner.auth).expect(404);
  });

  it("does not let another user edit or delete someone else's transaction", async () => {
    const accountId = await createAccount(owner, 'Private', 100);
    const created = await record(owner, {
      accountId, categoryId: expenseCategory, amount: 20, type: 'expense', date: today,
    });

    await request(app)
      .put(`/api/transactions/${created.transactionId}`)
      .set(other.auth)
      .send({ accountId, categoryId: expenseCategory, amount: 1, type: 'expense', date: today })
      .expect(404);
    await request(app).delete(`/api/transactions/${created.transactionId}`).set(other.auth).expect(404);
    expect(await balanceOf(owner, accountId)).toBe(80);

    // Moving your own transaction onto somebody else's account is also refused and changes nothing.
    const otherAccount = await createAccount(other, 'Other account', 10);
    await request(app)
      .put(`/api/transactions/${created.transactionId}`)
      .set(owner.auth)
      .send({ accountId: otherAccount, categoryId: expenseCategory, amount: 20, type: 'expense', date: today })
      .expect(404);
    expect(await balanceOf(owner, accountId)).toBe(80);
    expect(await balanceOf(other, otherAccount)).toBe(10);
  });

  it('rolls everything back when the update is invalid', async () => {
    const accountId = await createAccount(owner, 'Rollback', 100);
    const created = await record(owner, {
      accountId, categoryId: expenseCategory, amount: 30, type: 'expense', date: today,
    });

    // An income category cannot be used for an expense.
    await request(app)
      .put(`/api/transactions/${created.transactionId}`)
      .set(owner.auth)
      .send({ accountId, categoryId: incomeCategory, amount: 5, type: 'expense', date: today })
      .expect(400);
    await request(app)
      .put(`/api/transactions/${created.transactionId}`)
      .set(owner.auth)
      .send({ accountId, categoryId: expenseCategory, amount: -5, type: 'expense', date: today })
      .expect(400);

    expect(await balanceOf(owner, accountId)).toBe(70);
    const list = (await request(app).get('/api/transactions').set(owner.auth).expect(200)).body.transactions;
    expect(list.find((item) => item.transactionId === created.transactionId).amount).toBe(30);
  });

  it('keeps balances equal to opening balance plus transactions under concurrent edits, moves and deletes', async () => {
    const accountA = await createAccount(owner, 'Race A', 1000);
    const accountB = await createAccount(owner, 'Race B', 2000);
    const opening = { [accountA]: 1000, [accountB]: 2000 };

    const txs = [];
    for (let i = 0; i < 8; i += 1) {
      const accountId = i % 2 === 0 ? accountA : accountB;
      const type = i % 4 === 3 ? 'income' : 'expense';
      txs.push(await record(owner, {
        accountId,
        categoryId: type === 'income' ? incomeCategory : expenseCategory,
        amount: 10 + i,
        type,
        date: today,
      }));
    }

    const put = (tx, body) =>
      request(app).put(`/api/transactions/${tx.transactionId}`).set(owner.auth).send({ date: today, ...body });
    const calls = [];
    for (let round = 0; round < 3; round += 1) {
      txs.forEach((tx, i) => {
        const type = tx.type;
        const categoryId = type === 'income' ? incomeCategory : expenseCategory;
        // Opposite moves: even transactions go to B, odd ones go to A, at the same moment.
        calls.push(put(tx, { accountId: i % 2 === 0 ? accountB : accountA, categoryId, amount: 5 + i + round, type }));
        // Edit and delete the same transaction at the same moment.
        if (i < 3) calls.push(request(app).delete(`/api/transactions/${tx.transactionId}`).set(owner.auth));
      });
    }
    const responses = await Promise.all(calls);

    expect(responses.map((response) => response.status).filter((status) => status >= 500)).toEqual([]);
    expect(new Set(responses.map((response) => response.status))).toEqual(new Set([200, 404]));

    const list = (await request(app).get('/api/transactions').set(owner.auth).expect(200)).body.transactions;
    const mine = list.filter((item) => txs.some((tx) => tx.transactionId === item.transactionId));
    const expected = { ...opening };
    for (const item of mine) {
      expected[item.accountId] += item.type === 'income' ? item.amount : -item.amount;
    }
    expect(await balanceOf(owner, accountA)).toBeCloseTo(expected[accountA], 2);
    expect(await balanceOf(owner, accountB)).toBeCloseTo(expected[accountB], 2);
    // The first three transactions were deleted, and the other five are still there once each.
    expect(mine).toHaveLength(5);
  });

  it('never reports a transaction as missing when a delete races an edit that moves it', async () => {
    const accountA = await createAccount(owner, 'Move race A', 500);
    const accountB = await createAccount(owner, 'Move race B', 500);
    const statuses = [];
    for (let i = 0; i < 25; i += 1) {
      const created = await record(owner, {
        accountId: accountA, categoryId: expenseCategory, amount: 10, type: 'expense', date: today,
      });
      const [move, removal] = await Promise.all([
        request(app)
          .put(`/api/transactions/${created.transactionId}`)
          .set(owner.auth)
          .send({ accountId: accountB, categoryId: expenseCategory, amount: 10, type: 'expense', date: today }),
        request(app).delete(`/api/transactions/${created.transactionId}`).set(owner.auth),
      ]);
      statuses.push([move.status, removal.status]);
    }
    // The transaction exists and belongs to the user the whole time, so the delete always succeeds.
    expect(statuses.filter(([, removal]) => removal !== 200)).toEqual([]);
    expect(statuses.filter(([move]) => move >= 500)).toEqual([]);
    expect(await balanceOf(owner, accountA)).toBe(500);
    expect(await balanceOf(owner, accountB)).toBe(500);
  });

  it('shows edits and deletes in budget progress (reports read transactions live)', async () => {
    const accountId = await createAccount(owner, 'Budget', 1000);
    const period = '2026-09';
    const budgetCategory = (await request(app).get('/api/transactions/categories').set(owner.auth))
      .body.categories.filter((category) => category.type === 'expense')[2].categoryId;
    await request(app)
      .post('/api/budgets')
      .set(owner.auth)
      .send({ category_id: budgetCategory, period, limit_amount: 500 })
      .expect(201);
    const spent = async () => {
      const response = await request(app).get(`/api/budgets/progress?period=${period}`).set(owner.auth).expect(200);
      const budgets = response.body.budgets || response.body;
      return Number(budgets.find((budget) => budget.category_id === budgetCategory).spent);
    };

    const created = await record(owner, {
      accountId, categoryId: budgetCategory, amount: 100, type: 'expense', date: '2026-09-10',
    });
    expect(await spent()).toBe(100);

    await request(app)
      .put(`/api/transactions/${created.transactionId}`)
      .set(owner.auth)
      .send({ accountId, categoryId: budgetCategory, amount: 250, type: 'expense', date: '2026-09-10' })
      .expect(200);
    expect(await spent()).toBe(250);

    // Moving it to another month takes it out of this period's spending.
    await request(app)
      .put(`/api/transactions/${created.transactionId}`)
      .set(owner.auth)
      .send({ accountId, categoryId: budgetCategory, amount: 250, type: 'expense', date: '2026-10-10' })
      .expect(200);
    expect(await spent()).toBe(0);

    await request(app)
      .put(`/api/transactions/${created.transactionId}`)
      .set(owner.auth)
      .send({ accountId, categoryId: budgetCategory, amount: 250, type: 'expense', date: '2026-09-11' })
      .expect(200);
    expect(await spent()).toBe(250);
    await request(app).delete(`/api/transactions/${created.transactionId}`).set(owner.auth).expect(200);
    expect(await spent()).toBe(0);
  });

  it('requires authentication', async () => {
    await request(app).put('/api/transactions/x').send({}).expect(401);
    await request(app).delete('/api/transactions/x').expect(401);
  });
});
