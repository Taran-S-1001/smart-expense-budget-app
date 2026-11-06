/**
 * Independent Black-Box Test Suite
 *
 * Story: S2-05 — Transactions: Edit and delete transactions
 * Issue: #30
 * Requirement: SEBM-F-011
 * Acceptance Criterion: AC-SEBM-F-011:
 *   "Edited/deleted transaction is reflected immediately in balances and reports. Test: TC-Exp-02"
 * Test Case: TC-Exp-02
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

describe('TC-Exp-02 / SEBM-F-011 — Independent Transaction Edit & Delete Verification', () => {
  const createdUserIds = [];
  const testRunId = `indep_editdel_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;

  let predefinedExpenseCategoryId;
  let predefinedIncomeCategoryId;

  beforeAll(async () => {
    const catRes = await db.query(
      `SELECT category_id, name, type FROM categories WHERE user_id IS NULL ORDER BY name ASC`
    );
    predefinedExpenseCategoryId = catRes.rows.find((c) => c.type === 'expense')?.category_id;
    predefinedIncomeCategoryId = catRes.rows.find((c) => c.type === 'income')?.category_id;
  });

  const createTestUserWithAccounts = async (nameSuffix, initialBalances = [1000.0, 500.0]) => {
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

    const accounts = [];
    for (let i = 0; i < initialBalances.length; i++) {
      const accRes = await request(app)
        .post('/api/accounts')
        .set('Authorization', `Bearer ${token}`)
        .send({
          accountType: 'bank',
          accountName: `Account ${i + 1} ${nameSuffix}`,
          openingBalance: initialBalances[i],
        });
      accounts.push(accRes.body.account);
    }

    return { userId, email, token, accounts };
  };

  afterAll(async () => {
    if (createdUserIds.length > 0) {
      await db.query('DELETE FROM users WHERE user_id = ANY($1)', [createdUserIds]);
    }
    await db.closePool();
  });

  describe('AC-SEBM-F-011 Core Requirements (Edit Transaction & Balance Reversal)', () => {
    it('TC-Exp-02-HP-01: editing transaction amount correctly reverses old effect and applies new effect', async () => {
      const user = await createTestUserWithAccounts('EditAmount', [1000.0]);
      const accountId = user.accounts[0].accountId;

      // 1. Create original expense of 100.00 -> balance becomes 900.00
      const origRes = await request(app)
        .post('/api/transactions')
        .set('Authorization', `Bearer ${user.token}`)
        .send({
          accountId,
          categoryId: predefinedExpenseCategoryId,
          amount: 100.0,
          date: '2026-10-25',
          type: 'expense',
          notes: 'Original note',
        });
      const txnId = origRes.body.transactionId || origRes.body.transaction?.transactionId;
      expect(origRes.body.newBalance).toBe(900.0);

      // 2. Edit expense to 250.00 -> old 100 reversed (+100 -> 1000), new 250 deducted (-250 -> 750)
      const editRes = await request(app)
        .put(`/api/transactions/${txnId}`)
        .set('Authorization', `Bearer ${user.token}`)
        .send({
          accountId,
          categoryId: predefinedExpenseCategoryId,
          amount: 250.0,
          date: '2026-10-26',
          type: 'expense',
          notes: 'Updated note with higher amount',
        });

      expect(editRes.status).toBe(200);
      expect(editRes.body.newBalance).toBe(750.0);
      const amount = editRes.body.amount !== undefined ? editRes.body.amount : editRes.body.transaction?.amount;
      expect(amount).toBe(250.0);
      const notes = editRes.body.notes !== undefined ? editRes.body.notes : editRes.body.transaction?.notes;
      expect(notes).toBe('Updated note with higher amount');

      // Verify PostgreSQL balance
      const dbAcc = await db.query('SELECT balance FROM accounts WHERE account_id = $1', [accountId]);
      expect(Number(dbAcc.rows[0].balance)).toBe(750.0);
    });

    it('TC-Exp-02-HP-02: editing transaction type (expense -> income) reverses expense and credits income', async () => {
      const user = await createTestUserWithAccounts('EditType', [1000.0]);
      const accountId = user.accounts[0].accountId;

      // Create expense 200.00 -> balance 800.00
      const origRes = await request(app)
        .post('/api/transactions')
        .set('Authorization', `Bearer ${user.token}`)
        .send({
          accountId,
          categoryId: predefinedExpenseCategoryId,
          amount: 200.0,
          date: '2026-10-25',
          type: 'expense',
        });
      const txnId = origRes.body.transactionId || origRes.body.transaction?.transactionId;
      expect(origRes.body.newBalance).toBe(800.0);

      // Edit to income 300.00 -> reverses expense (+200 -> 1000) and adds income (+300 -> 1300)
      const editRes = await request(app)
        .put(`/api/transactions/${txnId}`)
        .set('Authorization', `Bearer ${user.token}`)
        .send({
          accountId,
          categoryId: predefinedIncomeCategoryId,
          amount: 300.0,
          date: '2026-10-25',
          type: 'income',
        });

      expect(editRes.status).toBe(200);
      expect(editRes.body.newBalance).toBe(1300.0);
      const type = editRes.body.type !== undefined ? editRes.body.type : editRes.body.transaction?.type;
      expect(type).toBe('income');

      // Check real DB balance
      const dbAcc = await db.query('SELECT balance FROM accounts WHERE account_id = $1', [accountId]);
      expect(Number(dbAcc.rows[0].balance)).toBe(1300.0);
    });

    it('TC-Exp-02-HP-03: changing account during edit preserves both accounts balances accurately', async () => {
      const user = await createTestUserWithAccounts('MoveAccount', [1000.0, 500.0]);
      const acc1Id = user.accounts[0].accountId; // 1000
      const acc2Id = user.accounts[1].accountId; // 500

      // Create expense 150.00 on Account 1 -> Acc 1 balance: 850.00, Acc 2 balance: 500.00
      const origRes = await request(app)
        .post('/api/transactions')
        .set('Authorization', `Bearer ${user.token}`)
        .send({
          accountId: acc1Id,
          categoryId: predefinedExpenseCategoryId,
          amount: 150.0,
          date: '2026-10-25',
          type: 'expense',
        });
      const txnId = origRes.body.transactionId || origRes.body.transaction?.transactionId;

      // Edit transaction to move to Account 2 with amount 200.00:
      // Acc 1 should reverse -150 (+150 -> 1000.00)
      // Acc 2 should apply -200 (500 - 200 -> 300.00)
      const editRes = await request(app)
        .put(`/api/transactions/${txnId}`)
        .set('Authorization', `Bearer ${user.token}`)
        .send({
          accountId: acc2Id,
          categoryId: predefinedExpenseCategoryId,
          amount: 200.0,
          date: '2026-10-25',
          type: 'expense',
        });

      expect(editRes.status).toBe(200);
      expect(editRes.body.newBalance).toBe(300.0); // Acc 2 balance
      expect(editRes.body.previousAccountBalance).toBe(1000.0); // Acc 1 balance

      // Verify both balances in PostgreSQL
      const dbAcc1 = await db.query('SELECT balance FROM accounts WHERE account_id = $1', [acc1Id]);
      const dbAcc2 = await db.query('SELECT balance FROM accounts WHERE account_id = $1', [acc2Id]);
      expect(Number(dbAcc1.rows[0].balance)).toBe(1000.0);
      expect(Number(dbAcc2.rows[0].balance)).toBe(300.0);
    });
  });

  describe('AC-SEBM-F-011 Core Requirements (Delete Transaction & Balance Reversal)', () => {
    it('TC-Exp-02-HP-04: deleting an expense transaction restores the debited account balance', async () => {
      const user = await createTestUserWithAccounts('DelExpense', [1000.0]);
      const accountId = user.accounts[0].accountId;

      // Create expense 350.00 -> balance becomes 650.00
      const origRes = await request(app)
        .post('/api/transactions')
        .set('Authorization', `Bearer ${user.token}`)
        .send({
          accountId,
          categoryId: predefinedExpenseCategoryId,
          amount: 350.0,
          date: '2026-10-25',
          type: 'expense',
        });
      const txnId = origRes.body.transactionId || origRes.body.transaction?.transactionId;
      expect(origRes.body.newBalance).toBe(650.0);

      // Delete the transaction
      const delRes = await request(app)
        .delete(`/api/transactions/${txnId}`)
        .set('Authorization', `Bearer ${user.token}`);

      expect(delRes.status).toBe(200);
      expect(delRes.body.newBalance).toBe(1000.0); // Restored!
      const deletedId = delRes.body.transactionId || delRes.body.transaction?.transactionId;
      expect(deletedId).toBe(txnId);

      // Verify transaction no longer exists in GET /api/transactions
      const listRes = await request(app)
        .get('/api/transactions')
        .set('Authorization', `Bearer ${user.token}`);
      const found = listRes.body.transactions.find((t) => t.transactionId === txnId);
      expect(found).toBeUndefined();

      // Verify row deleted from PostgreSQL
      const dbTxn = await db.query('SELECT * FROM transactions WHERE transaction_id = $1', [txnId]);
      expect(dbTxn.rows.length).toBe(0);

      // Verify account balance restored in PostgreSQL
      const dbAcc = await db.query('SELECT balance FROM accounts WHERE account_id = $1', [accountId]);
      expect(Number(dbAcc.rows[0].balance)).toBe(1000.0);
    });

    it('TC-Exp-02-HP-05: deleting an income transaction restores the credited account balance', async () => {
      const user = await createTestUserWithAccounts('DelIncome', [1000.0]);
      const accountId = user.accounts[0].accountId;

      // Create income 400.00 -> balance 1400.00
      const origRes = await request(app)
        .post('/api/transactions')
        .set('Authorization', `Bearer ${user.token}`)
        .send({
          accountId,
          categoryId: predefinedIncomeCategoryId,
          amount: 400.0,
          date: '2026-10-25',
          type: 'income',
        });
      const txnId = origRes.body.transactionId || origRes.body.transaction?.transactionId;
      expect(origRes.body.newBalance).toBe(1400.0);

      // Delete transaction -> reverses credit (-400 -> 1000.00)
      const delRes = await request(app)
        .delete(`/api/transactions/${txnId}`)
        .set('Authorization', `Bearer ${user.token}`);

      expect(delRes.status).toBe(200);
      expect(delRes.body.newBalance).toBe(1000.0);

      const dbAcc = await db.query('SELECT balance FROM accounts WHERE account_id = $1', [accountId]);
      expect(Number(dbAcc.rows[0].balance)).toBe(1000.0);
    });
  });

  describe('AC-SEBM-F-011 Report Verification (/api/reports/weekly)', () => {
    it('TC-Exp-02-REP-01: weekly report immediately reflects transaction edit and subsequent deletion', async () => {
      const user = await createTestUserWithAccounts('ReportSync', [2000.0]);
      const accountId = user.accounts[0].accountId;
      const targetDate = '2026-10-21';
      const startDate = '2026-10-19';
      const endDate = '2026-10-25';

      // 1. Initially, user has no transactions in this date range
      const initialRep = await request(app)
        .get(`/api/reports/weekly?startDate=${startDate}&endDate=${endDate}`)
        .set('Authorization', `Bearer ${user.token}`);
      expect(initialRep.status).toBe(200);
      expect(Number(initialRep.body.totalExpense)).toBe(0);
      expect(initialRep.body.transactionCount).toBe(0);

      // 2. Create initial expense transaction: 120.00
      const createRes = await request(app)
        .post('/api/transactions')
        .set('Authorization', `Bearer ${user.token}`)
        .send({
          accountId,
          categoryId: predefinedExpenseCategoryId,
          amount: 120.0,
          date: targetDate,
          type: 'expense',
          notes: 'Groceries before edit',
        });
      const txnId = createRes.body.transactionId || createRes.body.transaction?.transactionId;

      // Report immediately reflects 120.00 expense
      const repAfterCreate = await request(app)
        .get(`/api/reports/weekly?startDate=${startDate}&endDate=${endDate}`)
        .set('Authorization', `Bearer ${user.token}`);
      expect(repAfterCreate.status).toBe(200);
      expect(Number(repAfterCreate.body.totalExpense)).toBe(120.0);
      expect(Number(repAfterCreate.body.netSavings)).toBe(-120.0);
      expect(repAfterCreate.body.transactionCount).toBe(1);
      expect(repAfterCreate.body.transactions[0].transaction_id).toBe(txnId);

      // 3. Edit the transaction amount to 275.50
      const editRes = await request(app)
        .put(`/api/transactions/${txnId}`)
        .set('Authorization', `Bearer ${user.token}`)
        .send({
          accountId,
          categoryId: predefinedExpenseCategoryId,
          amount: 275.5,
          date: targetDate,
          type: 'expense',
          notes: 'Groceries edited amount',
        });
      expect(editRes.status).toBe(200);

      // Report immediately reflects edited amount 275.50
      const repAfterEdit = await request(app)
        .get(`/api/reports/weekly?startDate=${startDate}&endDate=${endDate}`)
        .set('Authorization', `Bearer ${user.token}`);
      expect(repAfterEdit.status).toBe(200);
      expect(Number(repAfterEdit.body.totalExpense)).toBe(275.5);
      expect(Number(repAfterEdit.body.netSavings)).toBe(-275.5);
      expect(repAfterEdit.body.transactionCount).toBe(1);
      expect(Number(repAfterEdit.body.transactions[0].amount)).toBe(275.5);

      // 4. Delete the transaction
      const delRes = await request(app)
        .delete(`/api/transactions/${txnId}`)
        .set('Authorization', `Bearer ${user.token}`);
      expect(delRes.status).toBe(200);

      // Report immediately reflects deletion: 0.00 expense, 0 transactions
      const repAfterDel = await request(app)
        .get(`/api/reports/weekly?startDate=${startDate}&endDate=${endDate}`)
        .set('Authorization', `Bearer ${user.token}`);
      expect(repAfterDel.status).toBe(200);
      expect(Number(repAfterDel.body.totalExpense)).toBe(0);
      expect(Number(repAfterDel.body.netSavings)).toBe(0);
      expect(repAfterDel.body.transactionCount).toBe(0);
      expect(repAfterDel.body.transactions).toHaveLength(0);
    });
  });

  describe('Validation & Boundary Enforcement on Edit', () => {
    it('TC-Exp-02-VAL-01: rejects invalid amount or date on edit and preserves original record and balance', async () => {
      const user = await createTestUserWithAccounts('EditVal', [500.0]);
      const accountId = user.accounts[0].accountId;

      const origRes = await request(app)
        .post('/api/transactions')
        .set('Authorization', `Bearer ${user.token}`)
        .send({
          accountId,
          categoryId: predefinedExpenseCategoryId,
          amount: 50.0,
          date: '2026-10-25',
          type: 'expense',
        });
      const txnId = origRes.body.transactionId || origRes.body.transaction?.transactionId;

      // Edit with invalid negative amount
      const badAmountRes = await request(app)
        .put(`/api/transactions/${txnId}`)
        .set('Authorization', `Bearer ${user.token}`)
        .send({
          accountId,
          categoryId: predefinedExpenseCategoryId,
          amount: -20.0,
          date: '2026-10-25',
          type: 'expense',
        });
      expect(badAmountRes.status).toBe(400);

      // Edit with invalid date (e.g. Feb 30)
      const badDateRes = await request(app)
        .put(`/api/transactions/${txnId}`)
        .set('Authorization', `Bearer ${user.token}`)
        .send({
          accountId,
          categoryId: predefinedExpenseCategoryId,
          amount: 60.0,
          date: '2026-02-30',
          type: 'expense',
        });
      expect(badDateRes.status).toBe(400);

      // Verify balance remains 450.00 (original 500 - 50)
      const dbAcc = await db.query('SELECT balance FROM accounts WHERE account_id = $1', [accountId]);
      expect(Number(dbAcc.rows[0].balance)).toBe(450.0);

      // Verify transaction record unmodified
      const dbTxn = await db.query('SELECT amount FROM transactions WHERE transaction_id = $1', [txnId]);
      expect(Number(dbTxn.rows[0].amount)).toBe(50.0);
    });

    it('TC-Exp-02-VAL-02: returns 404 for non-existent transactionId on edit and delete', async () => {
      const user = await createTestUserWithAccounts('NonExistent', [500.0]);

      const editRes = await request(app)
        .put('/api/transactions/txn_non_existent_12345')
        .set('Authorization', `Bearer ${user.token}`)
        .send({
          accountId: user.accounts[0].accountId,
          categoryId: predefinedExpenseCategoryId,
          amount: 50.0,
          date: '2026-10-25',
          type: 'expense',
        });
      expect(editRes.status).toBe(404);
      expect(editRes.body.error.code).toBe('TRANSACTION_NOT_FOUND');

      const delRes = await request(app)
        .delete('/api/transactions/txn_non_existent_12345')
        .set('Authorization', `Bearer ${user.token}`);
      expect(delRes.status).toBe(404);
      expect(delRes.body.error.code).toBe('TRANSACTION_NOT_FOUND');
    });
  });

  describe('Multi-User Security & Isolation', () => {
    it('TC-Exp-02-SEC-01: User B cannot edit User A transaction', async () => {
      const userA = await createTestUserWithAccounts('UserA', [1000.0]);
      const userB = await createTestUserWithAccounts('UserB', [500.0]);

      // User A creates transaction
      const origRes = await request(app)
        .post('/api/transactions')
        .set('Authorization', `Bearer ${userA.token}`)
        .send({
          accountId: userA.accounts[0].accountId,
          categoryId: predefinedExpenseCategoryId,
          amount: 100.0,
          date: '2026-10-25',
          type: 'expense',
        });
      const txnId = origRes.body.transactionId || origRes.body.transaction?.transactionId;

      // User B attempts to edit User A's transaction
      const attackRes = await request(app)
        .put(`/api/transactions/${txnId}`)
        .set('Authorization', `Bearer ${userB.token}`)
        .send({
          accountId: userB.accounts[0].accountId,
          categoryId: predefinedExpenseCategoryId,
          amount: 5.0,
          date: '2026-10-25',
          type: 'expense',
        });

      expect([404]).toContain(attackRes.status);
      expect(['TRANSACTION_NOT_FOUND', 'ACCOUNT_NOT_FOUND']).toContain(attackRes.body.error.code);

      // User A's transaction and account balance remain unchanged
      const dbTxn = await db.query('SELECT amount FROM transactions WHERE transaction_id = $1', [txnId]);
      expect(Number(dbTxn.rows[0].amount)).toBe(100.0);

      const dbAccA = await db.query('SELECT balance FROM accounts WHERE account_id = $1', [userA.accounts[0].accountId]);
      expect(Number(dbAccA.rows[0].balance)).toBe(900.0);
    });

    it('TC-Exp-02-SEC-02: User B cannot delete User A transaction', async () => {
      const userA = await createTestUserWithAccounts('UserADel', [1000.0]);
      const userB = await createTestUserWithAccounts('UserBDel', [500.0]);

      const origRes = await request(app)
        .post('/api/transactions')
        .set('Authorization', `Bearer ${userA.token}`)
        .send({
          accountId: userA.accounts[0].accountId,
          categoryId: predefinedExpenseCategoryId,
          amount: 100.0,
          date: '2026-10-25',
          type: 'expense',
        });
      const txnId = origRes.body.transactionId || origRes.body.transaction?.transactionId;

      // User B attempts to delete User A's transaction
      const attackRes = await request(app)
        .delete(`/api/transactions/${txnId}`)
        .set('Authorization', `Bearer ${userB.token}`);

      expect(attackRes.status).toBe(404);
      expect(attackRes.body.error.code).toBe('TRANSACTION_NOT_FOUND');

      // Transaction still exists in DB
      const dbTxn = await db.query('SELECT * FROM transactions WHERE transaction_id = $1', [txnId]);
      expect(dbTxn.rows.length).toBe(1);

      // User A's balance still 900.00
      const dbAccA = await db.query('SELECT balance FROM accounts WHERE account_id = $1', [userA.accounts[0].accountId]);
      expect(Number(dbAccA.rows[0].balance)).toBe(900.0);
    });
  });

  describe('Authentication Enforcement (PUT & DELETE)', () => {
    it('TC-Exp-02-AUTH-01: rejects PUT and DELETE without token with 401 MISSING_AUTHORIZATION', async () => {
      const resPut = await request(app)
        .put('/api/transactions/txn_test_auth_123')
        .send({ amount: 50.0 });
      expect(resPut.status).toBe(401);
      expect(resPut.body.error.code).toBe('MISSING_AUTHORIZATION');

      const resDel = await request(app).delete('/api/transactions/txn_test_auth_123');
      expect(resDel.status).toBe(401);
      expect(resDel.body.error.code).toBe('MISSING_AUTHORIZATION');
    });

    it('TC-Exp-02-AUTH-02: rejects PUT and DELETE with non-Bearer scheme with 401 INVALID_AUTHORIZATION', async () => {
      const resPut = await request(app)
        .put('/api/transactions/txn_test_auth_123')
        .set('Authorization', 'Basic dXNlcjpwYXNz')
        .send({ amount: 50.0 });
      expect(resPut.status).toBe(401);
      expect(resPut.body.error.code).toBe('INVALID_AUTHORIZATION');

      const resDel = await request(app)
        .delete('/api/transactions/txn_test_auth_123')
        .set('Authorization', 'Basic dXNlcjpwYXNz');
      expect(resDel.status).toBe(401);
      expect(resDel.body.error.code).toBe('INVALID_AUTHORIZATION');
    });

    it('TC-Exp-02-AUTH-03: rejects forged or tampered bearer tokens with 401 INVALID_TOKEN', async () => {
      const forgedToken = jwt.sign(
        { userId: 'usr_forged_999', role: 'user' },
        'completely_wrong_secret_key_123456789'
      );

      const resPut = await request(app)
        .put('/api/transactions/txn_test_auth_123')
        .set('Authorization', `Bearer ${forgedToken}`)
        .send({ amount: 50.0 });
      expect(resPut.status).toBe(401);
      expect(resPut.body.error.code).toBe('INVALID_TOKEN');

      const resDel = await request(app)
        .delete('/api/transactions/txn_test_auth_123')
        .set('Authorization', `Bearer ${forgedToken}`);
      expect(resDel.status).toBe(401);
      expect(resDel.body.error.code).toBe('INVALID_TOKEN');
    });

    it('TC-Exp-02-AUTH-04: rejects expired tokens with 401 INVALID_TOKEN', async () => {
      const expiredToken = jwt.sign(
        { userId: 'usr_expired_999', role: 'user' },
        config.jwtSecret,
        { expiresIn: '-10s' }
      );

      const resPut = await request(app)
        .put('/api/transactions/txn_test_auth_123')
        .set('Authorization', `Bearer ${expiredToken}`)
        .send({ amount: 50.0 });
      expect(resPut.status).toBe(401);
      expect(resPut.body.error.code).toBe('INVALID_TOKEN');

      const resDel = await request(app)
        .delete('/api/transactions/txn_test_auth_123')
        .set('Authorization', `Bearer ${expiredToken}`);
      expect(resDel.status).toBe(401);
      expect(resDel.body.error.code).toBe('INVALID_TOKEN');
    });
  });

  describe('Concurrency & Data Integrity Verification', () => {
    it('TC-Exp-02-CONC-01: concurrent deletions do not corrupt account balance or duplicate deletions', async () => {
      const user = await createTestUserWithAccounts('ConcurrencyTest', [2000.0]);
      const accountId = user.accounts[0].accountId;

      // Create 5 transactions of 50.00 each -> initial account balance: 1750.00
      const txnIds = [];
      for (let i = 0; i < 5; i++) {
        const res = await request(app)
          .post('/api/transactions')
          .set('Authorization', `Bearer ${user.token}`)
          .send({
            accountId,
            categoryId: predefinedExpenseCategoryId,
            amount: 50.0,
            date: '2026-10-25',
            type: 'expense',
          });
        txnIds.push(res.body.transactionId || res.body.transaction?.transactionId);
      }

      // Execute 5 concurrent deletions via Promise.all
      const delPromises = txnIds.map((id) =>
        request(app)
          .delete(`/api/transactions/${id}`)
          .set('Authorization', `Bearer ${user.token}`)
      );
      const delResponses = await Promise.all(delPromises);

      // All 5 deletions should succeed with 200
      delResponses.forEach((res) => {
        expect(res.status).toBe(200);
      });

      // Total restored balance must exactly equal original opening balance 2000.00
      const dbAcc = await db.query('SELECT balance FROM accounts WHERE account_id = $1', [accountId]);
      expect(Number(dbAcc.rows[0].balance)).toBe(2000.0);

      // Transactions count must be 0
      const dbTxns = await db.query('SELECT COUNT(*) FROM transactions WHERE account_id = $1', [accountId]);
      expect(Number(dbTxns.rows[0].count)).toBe(0);
    });

    it('TC-Exp-02-CONC-02: concurrent edits against different transactions on the same account preserve exact balance', async () => {
      const user = await createTestUserWithAccounts('ConcurrentEdits', [1000.0]);
      const accountId = user.accounts[0].accountId;

      // Create Txn 1: 100.00 expense
      const res1 = await request(app)
        .post('/api/transactions')
        .set('Authorization', `Bearer ${user.token}`)
        .send({
          accountId,
          categoryId: predefinedExpenseCategoryId,
          amount: 100.0,
          date: '2026-10-25',
          type: 'expense',
        });
      const txn1Id = res1.body.transactionId || res1.body.transaction?.transactionId;

      // Create Txn 2: 100.00 expense
      const res2 = await request(app)
        .post('/api/transactions')
        .set('Authorization', `Bearer ${user.token}`)
        .send({
          accountId,
          categoryId: predefinedExpenseCategoryId,
          amount: 100.0,
          date: '2026-10-25',
          type: 'expense',
        });
      const txn2Id = res2.body.transactionId || res2.body.transaction?.transactionId;

      // Account balance after both: 1000 - 100 - 100 = 800.00
      const midAcc = await db.query('SELECT balance FROM accounts WHERE account_id = $1', [accountId]);
      expect(Number(midAcc.rows[0].balance)).toBe(800.0);

      // Concurrently edit Txn 1 to 200.00 and Txn 2 to 300.00
      // Expected total expenses: 200 + 300 = 500.00
      // Expected final account balance: 1000 - 500 = 500.00
      const editPromises = [
        request(app)
          .put(`/api/transactions/${txn1Id}`)
          .set('Authorization', `Bearer ${user.token}`)
          .send({
            accountId,
            categoryId: predefinedExpenseCategoryId,
            amount: 200.0,
            date: '2026-10-25',
            type: 'expense',
          }),
        request(app)
          .put(`/api/transactions/${txn2Id}`)
          .set('Authorization', `Bearer ${user.token}`)
          .send({
            accountId,
            categoryId: predefinedExpenseCategoryId,
            amount: 300.0,
            date: '2026-10-25',
            type: 'expense',
          }),
      ];

      const responses = await Promise.all(editPromises);
      expect(responses[0].status).toBe(200);
      expect(responses[1].status).toBe(200);

      // Final balance in PostgreSQL must be exactly 500.00
      const finalAcc = await db.query('SELECT balance FROM accounts WHERE account_id = $1', [accountId]);
      expect(Number(finalAcc.rows[0].balance)).toBe(500.0);

      // Both transactions in database must match edited amounts
      const dbTxn1 = await db.query('SELECT amount FROM transactions WHERE transaction_id = $1', [txn1Id]);
      const dbTxn2 = await db.query('SELECT amount FROM transactions WHERE transaction_id = $1', [txn2Id]);
      expect(Number(dbTxn1.rows[0].amount)).toBe(200.0);
      expect(Number(dbTxn2.rows[0].amount)).toBe(300.0);
    });

    it('TC-Exp-02-CONC-03: concurrent edit-versus-delete scenario maintains database and balance consistency', async () => {
      const user = await createTestUserWithAccounts('EditVsDel', [1000.0]);
      const accountId = user.accounts[0].accountId;

      // Txn A: 100.00 expense
      const resA = await request(app)
        .post('/api/transactions')
        .set('Authorization', `Bearer ${user.token}`)
        .send({
          accountId,
          categoryId: predefinedExpenseCategoryId,
          amount: 100.0,
          date: '2026-10-25',
          type: 'expense',
        });
      const txnAId = resA.body.transactionId || resA.body.transaction?.transactionId;

      // Txn B: 150.00 expense
      const resB = await request(app)
        .post('/api/transactions')
        .set('Authorization', `Bearer ${user.token}`)
        .send({
          accountId,
          categoryId: predefinedExpenseCategoryId,
          amount: 150.0,
          date: '2026-10-25',
          type: 'expense',
        });
      const txnBId = resB.body.transactionId || resB.body.transaction?.transactionId;

      // Balance before concurrent ops: 1000 - 100 - 150 = 750.00
      const midAcc = await db.query('SELECT balance FROM accounts WHERE account_id = $1', [accountId]);
      expect(Number(midAcc.rows[0].balance)).toBe(750.0);

      // Concurrently:
      // Edit Txn A: change amount from 100.00 to 200.00 (debits extra 100.00)
      // Delete Txn B: deletes 150.00 expense (credits back 150.00)
      // Net change: -100.00 + 150.00 = +50.00
      // Final balance: 750.00 + 50.00 = 800.00
      const ops = [
        request(app)
          .put(`/api/transactions/${txnAId}`)
          .set('Authorization', `Bearer ${user.token}`)
          .send({
            accountId,
            categoryId: predefinedExpenseCategoryId,
            amount: 200.0,
            date: '2026-10-25',
            type: 'expense',
          }),
        request(app)
          .delete(`/api/transactions/${txnBId}`)
          .set('Authorization', `Bearer ${user.token}`),
      ];

      const [editRes, delRes] = await Promise.all(ops);
      expect(editRes.status).toBe(200);
      expect(delRes.status).toBe(200);

      // Balance in PostgreSQL must be exactly 800.00
      const finalAcc = await db.query('SELECT balance FROM accounts WHERE account_id = $1', [accountId]);
      expect(Number(finalAcc.rows[0].balance)).toBe(800.0);

      // Txn A remains in DB with amount 200.00
      const dbTxnA = await db.query('SELECT amount FROM transactions WHERE transaction_id = $1', [txnAId]);
      expect(dbTxnA.rows.length).toBe(1);
      expect(Number(dbTxnA.rows[0].amount)).toBe(200.0);

      // Txn B removed from DB
      const dbTxnB = await db.query('SELECT * FROM transactions WHERE transaction_id = $1', [txnBId]);
      expect(dbTxnB.rows.length).toBe(0);
    });
  });
});
