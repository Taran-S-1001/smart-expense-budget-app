/**
 * Independent Black-Box Test Suite
 *
 * Story: S1-04 — Transactions: Add expense and income entries
 * Issue: #19
 * Requirement: SEBM-F-010
 * Acceptance Criterion: AC-SEBM-F-010:
 *   "Entry is saved and appears in the transaction list and updates the relevant account balance. Test: TC-Exp-01"
 * Test Case: TC-Exp-01
 * Tester: Dev D (Surya Raju Naik) independently testing Dev A (Taran S)
 *
 * Environment: Real HTTP requests via Supertest, Real PostgreSQL (sebm_test)
 */

const request = require('supertest');
const jwt = require('jsonwebtoken');
const app = require('../../../src/app');
const db = require('../../../src/db');
const { signTestToken } = require('../../../src/auth/jwt');
const config = require('../../../src/config');

describe('TC-Exp-01 / SEBM-F-010 — Independent Expense & Income Transaction Verification', () => {
  const createdUserIds = [];
  const testRunId = `indep_txn_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;

  let predefinedExpenseCategoryId;
  let predefinedIncomeCategoryId;

  beforeAll(async () => {
    // Look up real predefined categories from seeded database
    const catRes = await db.query(
      `SELECT category_id, name, type FROM categories WHERE user_id IS NULL ORDER BY name ASC`
    );
    const expCat = catRes.rows.find((c) => c.type === 'expense');
    const incCat = catRes.rows.find((c) => c.type === 'income');
    predefinedExpenseCategoryId = expCat ? expCat.category_id : null;
    predefinedIncomeCategoryId = incCat ? incCat.category_id : null;
  });

  const createTestUserWithAccount = async (nameSuffix, initialBalance = 1000.0) => {
    const userId = `usr_${testRunId}_${Math.random().toString(36).substring(2, 7)}`;
    const email = `${userId}@example.com`;
    const name = `Independent Tester ${nameSuffix}`;
    const passwordHash = '$2a$10$abcdefghijklmnopqrstuvwxyz1234567890abcdefghijklmnopqr';
    await db.query(
      `INSERT INTO users (user_id, email, password_hash, name, role)
       VALUES ($1, $2, $3, $4, 'user')`,
      [userId, email, passwordHash, name]
    );
    createdUserIds.push(userId);
    const token = signTestToken(userId, 'user');

    // Create account via API
    const accRes = await request(app)
      .post('/api/accounts')
      .set('Authorization', `Bearer ${token}`)
      .send({
        accountType: 'bank',
        accountName: `Main Account ${nameSuffix}`,
        openingBalance: initialBalance,
      });

    return {
      userId,
      email,
      token,
      account: accRes.body.account,
    };
  };

  afterAll(async () => {
    try {
      if (createdUserIds.length > 0) {
        await db.query('DELETE FROM users WHERE user_id = ANY($1)', [createdUserIds]);
      }
    } finally {
      await db.closePool();
    }
  });

  describe('AC-SEBM-F-010 Core Requirements & Balance Effects', () => {
    it('TC-Exp-01-HP-01: expense decreases account balance and appears in transaction list and database', async () => {
      const user = await createTestUserWithAccount('ExpenseTest', 1000.0);
      const expenseAmount = 150.5;

      const createRes = await request(app)
        .post('/api/transactions')
        .set('Authorization', `Bearer ${user.token}`)
        .send({
          accountId: user.account.accountId,
          categoryId: predefinedExpenseCategoryId,
          amount: expenseAmount,
          date: '2026-10-25',
          type: 'expense',
          notes: 'Team lunch expense',
        });

      expect(createRes.status).toBe(201);
      const txnId = createRes.body.transactionId || createRes.body.transaction?.transactionId;
      expect(txnId).toBeDefined();
      expect(createRes.body.amount || createRes.body.transaction?.amount).toBe(expenseAmount);
      expect(createRes.body.type || createRes.body.transaction?.type).toBe('expense');
      expect(createRes.body.notes || createRes.body.transaction?.notes).toBe('Team lunch expense');
      expect(createRes.body.newBalance).toBe(849.5); // 1000.00 - 150.50

      // Verify transaction appears in GET /api/transactions
      const listRes = await request(app)
        .get('/api/transactions')
        .set('Authorization', `Bearer ${user.token}`);

      expect(listRes.status).toBe(200);
      expect(Array.isArray(listRes.body.transactions)).toBe(true);
      const found = listRes.body.transactions.find((t) => t.transactionId === txnId);
      expect(found).toBeDefined();
      expect(found.amount).toBe(expenseAmount);
      expect(found.type).toBe('expense');

      // Verify updated account balance via GET /api/accounts
      const accRes = await request(app)
        .get('/api/accounts')
        .set('Authorization', `Bearer ${user.token}`);
      const updatedAcc = accRes.body.accounts.find((a) => a.accountId === user.account.accountId);
      expect(updatedAcc.balance).toBe(849.5);

      // Verify PostgreSQL persistence
      const dbTxn = await db.query(
        'SELECT transaction_id, amount, type, date, notes FROM transactions WHERE transaction_id = $1',
        [txnId]
      );
      expect(dbTxn.rows.length).toBe(1);
      expect(Number(dbTxn.rows[0].amount)).toBe(expenseAmount);

      const dbAcc = await db.query(
        'SELECT balance FROM accounts WHERE account_id = $1',
        [user.account.accountId]
      );
      expect(Number(dbAcc.rows[0].balance)).toBe(849.5);
    });

    it('TC-Exp-01-HP-02: income increases account balance and appears in transaction list and database', async () => {
      const user = await createTestUserWithAccount('IncomeTest', 500.0);
      const incomeAmount = 2500.75;

      const createRes = await request(app)
        .post('/api/transactions')
        .set('Authorization', `Bearer ${user.token}`)
        .send({
          accountId: user.account.accountId,
          categoryId: predefinedIncomeCategoryId,
          amount: incomeAmount,
          date: '2026-10-26',
          type: 'income',
          notes: 'Consulting freelance payment',
        });

      expect(createRes.status).toBe(201);
      expect(createRes.body.amount || createRes.body.transaction?.amount).toBe(incomeAmount);
      expect(createRes.body.type || createRes.body.transaction?.type).toBe('income');
      expect(createRes.body.newBalance).toBe(3000.75); // 500.00 + 2500.75

      // Verify account balance via API
      const accRes = await request(app)
        .get('/api/accounts')
        .set('Authorization', `Bearer ${user.token}`);
      const acc = accRes.body.accounts.find((a) => a.accountId === user.account.accountId);
      expect(acc.balance).toBe(3000.75);

      // Check real DB balance
      const dbAcc = await db.query('SELECT balance FROM accounts WHERE account_id = $1', [user.account.accountId]);
      expect(Number(dbAcc.rows[0].balance)).toBe(3000.75);
    });

    it('TC-Exp-01-HP-03: supports transactions with optional notes omitted or null', async () => {
      const user = await createTestUserWithAccount('NoNotes', 200.0);

      const res = await request(app)
        .post('/api/transactions')
        .set('Authorization', `Bearer ${user.token}`)
        .send({
          accountId: user.account.accountId,
          categoryId: predefinedExpenseCategoryId,
          amount: 50.0,
          date: '2026-10-27',
          type: 'expense',
        });

      expect(res.status).toBe(201);
      const notes = res.body.notes !== undefined ? res.body.notes : res.body.transaction?.notes;
      expect(notes).toBeNull();
      expect(res.body.newBalance).toBe(150.0);
    });
  });

  describe('Validation & Boundary Enforcement', () => {
    it('TC-Exp-01-VAL-01: rejects missing required fields with 400 VALIDATION_ERROR', async () => {
      const user = await createTestUserWithAccount('ValMissing', 100.0);

      // Missing amount
      const res1 = await request(app)
        .post('/api/transactions')
        .set('Authorization', `Bearer ${user.token}`)
        .send({
          accountId: user.account.accountId,
          categoryId: predefinedExpenseCategoryId,
          date: '2026-10-25',
          type: 'expense',
        });
      expect(res1.status).toBe(400);
      expect(res1.body.error.code).toBe('VALIDATION_ERROR');

      // Missing accountId
      const res2 = await request(app)
        .post('/api/transactions')
        .set('Authorization', `Bearer ${user.token}`)
        .send({
          categoryId: predefinedExpenseCategoryId,
          amount: 25.0,
          date: '2026-10-25',
          type: 'expense',
        });
      expect(res2.status).toBe(400);

      // Missing categoryId
      const res3 = await request(app)
        .post('/api/transactions')
        .set('Authorization', `Bearer ${user.token}`)
        .send({
          accountId: user.account.accountId,
          amount: 25.0,
          date: '2026-10-25',
          type: 'expense',
        });
      expect(res3.status).toBe(400);

      // Missing date
      const res4 = await request(app)
        .post('/api/transactions')
        .set('Authorization', `Bearer ${user.token}`)
        .send({
          accountId: user.account.accountId,
          categoryId: predefinedExpenseCategoryId,
          amount: 25.0,
          type: 'expense',
        });
      expect(res4.status).toBe(400);

      // Missing type
      const res5 = await request(app)
        .post('/api/transactions')
        .set('Authorization', `Bearer ${user.token}`)
        .send({
          accountId: user.account.accountId,
          categoryId: predefinedExpenseCategoryId,
          amount: 25.0,
          date: '2026-10-25',
        });
      expect(res5.status).toBe(400);
    });

    it('TC-Exp-01-VAL-02: rejects invalid amounts (zero, negative, >2 decimals, non-numeric) and preserves balance', async () => {
      const user = await createTestUserWithAccount('ValAmounts', 500.0);

      const invalidAmounts = [0, -50, -0.01, 25.999, 'not-a-number', ''];
      for (const amount of invalidAmounts) {
        const res = await request(app)
          .post('/api/transactions')
          .set('Authorization', `Bearer ${user.token}`)
          .send({
            accountId: user.account.accountId,
            categoryId: predefinedExpenseCategoryId,
            amount,
            date: '2026-10-25',
            type: 'expense',
          });
        expect(res.status).toBe(400);
      }

      // Balance must remain strictly unchanged at 500.00
      const dbAcc = await db.query('SELECT balance FROM accounts WHERE account_id = $1', [user.account.accountId]);
      expect(Number(dbAcc.rows[0].balance)).toBe(500.0);
    });

    it('TC-Exp-01-VAL-03: rejects invalid dates (bad format, non-existent calendar date like 2026-02-30)', async () => {
      const user = await createTestUserWithAccount('ValDates', 500.0);

      const invalidDates = ['2026/10/25', '25-10-2026', 'not-date', '2026-02-30', '2026-13-01', '2026-04-31'];
      for (const date of invalidDates) {
        const res = await request(app)
          .post('/api/transactions')
          .set('Authorization', `Bearer ${user.token}`)
          .send({
            accountId: user.account.accountId,
            categoryId: predefinedExpenseCategoryId,
            amount: 20.0,
            date,
            type: 'expense',
          });
        expect(res.status).toBe(400);
      }
    });

    it('TC-Exp-01-VAL-04: rejects category type mismatch (expense with income category, or vice versa)', async () => {
      const user = await createTestUserWithAccount('TypeMismatch', 500.0);

      // Attempt expense with income category
      const res1 = await request(app)
        .post('/api/transactions')
        .set('Authorization', `Bearer ${user.token}`)
        .send({
          accountId: user.account.accountId,
          categoryId: predefinedIncomeCategoryId,
          amount: 50.0,
          date: '2026-10-25',
          type: 'expense',
        });
      expect(res1.status).toBe(400);
      expect(res1.body.error.code).toBe('INVALID_CATEGORY');

      // Attempt income with expense category
      const res2 = await request(app)
        .post('/api/transactions')
        .set('Authorization', `Bearer ${user.token}`)
        .send({
          accountId: user.account.accountId,
          categoryId: predefinedExpenseCategoryId,
          amount: 50.0,
          date: '2026-10-25',
          type: 'income',
        });
      expect(res2.status).toBe(400);
      expect(res2.body.error.code).toBe('INVALID_CATEGORY');
    });

    it('TC-Exp-01-VAL-05: rejects non-string notes with 400 VALIDATION_ERROR and accepts valid strings', async () => {
      const user = await createTestUserWithAccount('NotesVal', 500.0);

      // Non-string notes (e.g. number, boolean, array) -> 400
      const badNotesRes = await request(app)
        .post('/api/transactions')
        .set('Authorization', `Bearer ${user.token}`)
        .send({
          accountId: user.account.accountId,
          categoryId: predefinedExpenseCategoryId,
          amount: 10.0,
          date: '2026-10-25',
          type: 'expense',
          notes: 12345,
        });
      expect(badNotesRes.status).toBe(400);
      expect(badNotesRes.body.error.code).toBe('VALIDATION_ERROR');

      // Valid string note
      const goodNotesRes = await request(app)
        .post('/api/transactions')
        .set('Authorization', `Bearer ${user.token}`)
        .send({
          accountId: user.account.accountId,
          categoryId: predefinedExpenseCategoryId,
          amount: 10.0,
          date: '2026-10-25',
          type: 'expense',
          notes: 'Valid string note',
        });
      expect(goodNotesRes.status).toBe(201);
      const note = goodNotesRes.body.notes !== undefined ? goodNotesRes.body.notes : goodNotesRes.body.transaction?.notes;
      expect(note).toBe('Valid string note');
    });
  });

  describe('PostgreSQL Transaction Atomicity & Rollback Guarantee', () => {
    it('TC-Exp-01-ROLL-01: genuine rollback where transaction insert succeeds but subsequent account balance update fails', async () => {
      const user = await createTestUserWithAccount('RollbackSim', 1000.0);
      const accountId = user.account.accountId;

      // Attach a temporary conditional PostgreSQL trigger on accounts that throws an exception
      // during UPDATE for this specific account, after the transaction INSERT has already executed.
      const triggerFuncName = `fail_account_update_${testRunId}`;
      const triggerName = `trg_fail_account_update_${testRunId}`;

      await db.query(`
        CREATE OR REPLACE FUNCTION ${triggerFuncName}()
        RETURNS trigger AS $$
        BEGIN
          IF NEW.account_id = '${accountId}' THEN
            RAISE EXCEPTION 'Simulated failure during account balance update step';
          END IF;
          RETURN NEW;
        END;
        $$ LANGUAGE plpgsql;
      `);

      await db.query(`
        CREATE TRIGGER ${triggerName}
        BEFORE UPDATE ON accounts
        FOR EACH ROW EXECUTE FUNCTION ${triggerFuncName}();
      `);

      try {
        // Attempt creating transaction via HTTP API
        const res = await request(app)
          .post('/api/transactions')
          .set('Authorization', `Bearer ${user.token}`)
          .send({
            accountId,
            categoryId: predefinedExpenseCategoryId,
            amount: 150.0,
            date: '2026-10-25',
            type: 'expense',
            notes: 'Rollback test note',
          });

        // The endpoint should fail with 500 because the balance update threw in the database transaction
        expect(res.status).toBe(500);

        // Verify that the transaction INSERT was completely rolled back in PostgreSQL
        const dbTxns = await db.query(
          'SELECT * FROM transactions WHERE account_id = $1',
          [accountId]
        );
        expect(dbTxns.rows.length).toBe(0);

        // Verify that the account balance remains strictly unchanged at 1000.00
        const dbAcc = await db.query(
          'SELECT balance FROM accounts WHERE account_id = $1',
          [accountId]
        );
        expect(Number(dbAcc.rows[0].balance)).toBe(1000.0);
      } finally {
        // Clean up temporary database trigger and function
        await db.query(`DROP TRIGGER IF EXISTS ${triggerName} ON accounts;`);
        await db.query(`DROP FUNCTION IF EXISTS ${triggerFuncName}();`);
      }
    });
  });

  describe('Security, Ownership Protection & Authentication', () => {
    it('TC-Exp-01-SEC-01: prevents User B from posting transactions to User A account (cross-user violation)', async () => {
      const userA = await createTestUserWithAccount('UserA', 1000.0);
      const userB = await createTestUserWithAccount('UserB', 500.0);

      // User B tries to record transaction on User A's account
      const attackRes = await request(app)
        .post('/api/transactions')
        .set('Authorization', `Bearer ${userB.token}`)
        .send({
          accountId: userA.account.accountId,
          categoryId: predefinedExpenseCategoryId,
          amount: 200.0,
          date: '2026-10-25',
          type: 'expense',
        });

      // Must fail with 404 ACCOUNT_NOT_FOUND (user cannot target another user's account)
      expect(attackRes.status).toBe(404);
      expect(attackRes.body.error.code).toBe('ACCOUNT_NOT_FOUND');

      // Verify User A's balance is intact
      const dbAcc = await db.query('SELECT balance FROM accounts WHERE account_id = $1', [userA.account.accountId]);
      expect(Number(dbAcc.rows[0].balance)).toBe(1000.0);

      // Verify no transaction record created
      const dbTxns = await db.query('SELECT COUNT(*) FROM transactions WHERE account_id = $1', [userA.account.accountId]);
      expect(Number(dbTxns.rows[0].count)).toBe(0);
    });

    it('TC-Exp-01-SEC-02: User B cannot see User A transactions in listTransactions', async () => {
      const userA = await createTestUserWithAccount('ListUserA', 500.0);
      const userB = await createTestUserWithAccount('ListUserB', 500.0);

      // User A creates transaction
      await request(app)
        .post('/api/transactions')
        .set('Authorization', `Bearer ${userA.token}`)
        .send({
          accountId: userA.account.accountId,
          categoryId: predefinedExpenseCategoryId,
          amount: 75.0,
          date: '2026-10-25',
          type: 'expense',
          notes: 'User A secret expense',
        });

      // User B fetches transactions
      const resB = await request(app)
        .get('/api/transactions')
        .set('Authorization', `Bearer ${userB.token}`);

      expect(resB.status).toBe(200);
      expect(resB.body.transactions.length).toBe(0);
    });

    it('TC-Exp-01-AUTH-01: rejects unauthenticated requests with 401 MISSING_AUTHORIZATION', async () => {
      const res = await request(app).get('/api/transactions');
      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe('MISSING_AUTHORIZATION');
    });

    it('TC-Exp-01-AUTH-02: rejects request with non-Bearer token scheme with 401 INVALID_AUTHORIZATION', async () => {
      const res = await request(app)
        .get('/api/transactions')
        .set('Authorization', 'Basic dXNlcjpwYXNz');
      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe('INVALID_AUTHORIZATION');
    });

    it('TC-Exp-01-AUTH-03: rejects forged/tampered bearer tokens with 401 INVALID_TOKEN', async () => {
      const forgedToken = jwt.sign(
        { userId: 'fake_attacker', role: 'user', tokenType: 'access' },
        'unauthorized-secret-key-12345678901234567890'
      );

      const res = await request(app)
        .get('/api/transactions')
        .set('Authorization', `Bearer ${forgedToken}`);
      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe('INVALID_TOKEN');
    });

    it('TC-Exp-01-AUTH-04: rejects expired tokens with 401 INVALID_TOKEN', async () => {
      const expiredToken = jwt.sign(
        { userId: 'usr_expired', role: 'user', tokenType: 'access' },
        config.jwtSecret,
        { expiresIn: '-5s' }
      );

      const res = await request(app)
        .post('/api/transactions')
        .set('Authorization', `Bearer ${expiredToken}`)
        .send({ amount: 50.0 });

      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe('INVALID_TOKEN');
    });
  });
});
