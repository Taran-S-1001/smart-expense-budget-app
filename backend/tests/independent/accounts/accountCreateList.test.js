/**
 * Independent Black-Box Test Suite
 *
 * Story: S1-03 — Accounts: Create and list multiple accounts
 * Issue: #18
 * Requirement: SEBM-F-030
 * Acceptance Criterion: AC-SEBM-F-030:
 *   "New account appears in the account list with an initial balance of zero or a user-specified opening balance. Test: TC-Acc-01"
 * Test Case: TC-Acc-01
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

describe('TC-Acc-01 / SEBM-F-030 — Independent Account Creation & Listing Verification', () => {
  const createdUserIds = [];
  const testRunId = `indep_acc_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;

  // Helper to provision a real test user directly in the test database
  const createTestUser = async (nameSuffix = 'User') => {
    const userId = `usr_${testRunId}_${Math.random().toString(36).substring(2, 7)}`;
    const email = `${userId}@example.com`;
    const name = `Independent Tester ${nameSuffix}`;
    const passwordHash = '$2a$10$abcdefghijklmnopqrstuvwxyz1234567890abcdefghijklmnopqr'; // dummy bcrypt
    await db.query(
      `INSERT INTO users (user_id, email, password_hash, name, role)
       VALUES ($1, $2, $3, $4, 'user')`,
      [userId, email, passwordHash, name]
    );
    createdUserIds.push(userId);
    const token = signTestToken(userId, 'user');
    return { userId, email, token };
  };

  afterAll(async () => {
    try {
      if (createdUserIds.length > 0) {
        // ON DELETE CASCADE automatically removes associated accounts and records
        await db.query('DELETE FROM users WHERE user_id = ANY($1)', [createdUserIds]);
      }
    } finally {
      await db.closePool();
    }
  });

  describe('AC-SEBM-F-030 Core Requirements (Happy Path)', () => {
    it('TC-Acc-01-HP-01: creates new account with default zero balance when openingBalance is omitted', async () => {
      const user = await createTestUser('ZeroBal');

      const createRes = await request(app)
        .post('/api/accounts')
        .set('Authorization', `Bearer ${user.token}`)
        .send({
          accountType: 'cash',
          accountName: 'Daily Cash Wallet',
        });

      expect(createRes.status).toBe(201);
      expect(createRes.body.account).toBeDefined();
      expect(createRes.body.account.accountId).toBeDefined();
      expect(createRes.body.account.userId).toBe(user.userId);
      expect(createRes.body.account.accountType).toBe('cash');
      expect(createRes.body.account.accountName).toBe('Daily Cash Wallet');
      expect(createRes.body.account.balance).toBe(0);

      // Verify the new account appears in GET /api/accounts
      const listRes = await request(app)
        .get('/api/accounts')
        .set('Authorization', `Bearer ${user.token}`);

      expect(listRes.status).toBe(200);
      expect(Array.isArray(listRes.body.accounts)).toBe(true);
      expect(listRes.body.accounts.length).toBe(1);
      expect(listRes.body.accounts[0].accountId).toBe(createRes.body.account.accountId);
      expect(listRes.body.accounts[0].balance).toBe(0);

      // Verify exact persistence in real PostgreSQL
      const dbRow = await db.query(
        'SELECT account_id, user_id, account_type, account_name, balance FROM accounts WHERE account_id = $1',
        [createRes.body.account.accountId]
      );
      expect(dbRow.rows.length).toBe(1);
      expect(Number(dbRow.rows[0].balance)).toBe(0);
      expect(dbRow.rows[0].account_name).toBe('Daily Cash Wallet');
    });

    it('TC-Acc-01-HP-02: creates new account with user-specified opening balance', async () => {
      const user = await createTestUser('SpecifiedBal');

      const createRes = await request(app)
        .post('/api/accounts')
        .set('Authorization', `Bearer ${user.token}`)
        .send({
          accountType: 'bank',
          accountName: 'HDFC Savings',
          openingBalance: 12500.75,
        });

      expect(createRes.status).toBe(201);
      expect(createRes.body.account.balance).toBe(12500.75);
      expect(createRes.body.account.accountName).toBe('HDFC Savings');
      expect(createRes.body.account.accountType).toBe('bank');

      // Verify account appears in list with specified balance
      const listRes = await request(app)
        .get('/api/accounts')
        .set('Authorization', `Bearer ${user.token}`);

      expect(listRes.status).toBe(200);
      const found = listRes.body.accounts.find((a) => a.accountId === createRes.body.account.accountId);
      expect(found).toBeDefined();
      expect(found.balance).toBe(12500.75);

      // Check PostgreSQL storage
      const dbRow = await db.query(
        'SELECT balance FROM accounts WHERE account_id = $1',
        [createRes.body.account.accountId]
      );
      expect(Number(dbRow.rows[0].balance)).toBe(12500.75);
    });

    it('TC-Acc-01-HP-03: supports multiple accounts for a single user, each with its own independent balance', async () => {
      const user = await createTestUser('MultiAcc');

      const acc1Res = await request(app)
        .post('/api/accounts')
        .set('Authorization', `Bearer ${user.token}`)
        .send({ accountType: 'cash', accountName: 'Pocket Cash', openingBalance: 150.0 });
      expect(acc1Res.status).toBe(201);

      const acc2Res = await request(app)
        .post('/api/accounts')
        .set('Authorization', `Bearer ${user.token}`)
        .send({ accountType: 'bank', accountName: 'Salary Account', openingBalance: 75000.5 });
      expect(acc2Res.status).toBe(201);

      const acc3Res = await request(app)
        .post('/api/accounts')
        .set('Authorization', `Bearer ${user.token}`)
        .send({ accountType: 'wallet', accountName: 'PayTM Wallet', openingBalance: 320.25 });
      expect(acc3Res.status).toBe(201);

      const listRes = await request(app)
        .get('/api/accounts')
        .set('Authorization', `Bearer ${user.token}`);

      expect(listRes.status).toBe(200);
      expect(listRes.body.accounts.length).toBe(3);

      const accMap = Object.fromEntries(listRes.body.accounts.map((a) => [a.accountName, a.balance]));
      expect(accMap['Pocket Cash']).toBe(150.0);
      expect(accMap['Salary Account']).toBe(75000.5);
      expect(accMap['PayTM Wallet']).toBe(320.25);
    });

    it('TC-Acc-01-HP-04: accepts string numeric opening balance and trims input fields', async () => {
      const user = await createTestUser('TrimTest');

      const createRes = await request(app)
        .post('/api/accounts')
        .set('Authorization', `Bearer ${user.token}`)
        .send({
          accountType: '  digital wallet  ',
          accountName: '  Amazon Pay Balance  ',
          openingBalance: '250.50',
        });

      expect(createRes.status).toBe(201);
      expect(createRes.body.account.accountType).toBe('digital wallet');
      expect(createRes.body.account.accountName).toBe('Amazon Pay Balance');
      expect(createRes.body.account.balance).toBe(250.5);
    });
  });

  describe('Validation & Boundary Verification', () => {
    it('TC-Acc-01-VAL-01: rejects missing accountType with 400 VALIDATION_ERROR', async () => {
      const user = await createTestUser('Val1');

      const res = await request(app)
        .post('/api/accounts')
        .set('Authorization', `Bearer ${user.token}`)
        .send({ accountName: 'Test Account' });

      expect(res.status).toBe(400);
      expect(res.body.error).toBeDefined();
      expect(res.body.error.code).toBe('VALIDATION_ERROR');

      // Ensure no phantom account created
      const dbRes = await db.query('SELECT COUNT(*) FROM accounts WHERE user_id = $1', [user.userId]);
      expect(Number(dbRes.rows[0].count)).toBe(0);
    });

    it('TC-Acc-01-VAL-02: rejects empty or whitespace accountType with 400', async () => {
      const user = await createTestUser('Val2');

      const res = await request(app)
        .post('/api/accounts')
        .set('Authorization', `Bearer ${user.token}`)
        .send({ accountType: '   ', accountName: 'Test Account' });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('TC-Acc-01-VAL-03: rejects accountType exceeding 50 characters with 400', async () => {
      const user = await createTestUser('Val3');
      const longType = 'T'.repeat(51);

      const res = await request(app)
        .post('/api/accounts')
        .set('Authorization', `Bearer ${user.token}`)
        .send({ accountType: longType, accountName: 'Valid Account Name' });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('TC-Acc-01-VAL-04: rejects missing accountName with 400 VALIDATION_ERROR', async () => {
      const user = await createTestUser('Val4');

      const res = await request(app)
        .post('/api/accounts')
        .set('Authorization', `Bearer ${user.token}`)
        .send({ accountType: 'bank' });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('TC-Acc-01-VAL-05: rejects accountName exceeding 100 characters with 400', async () => {
      const user = await createTestUser('Val5');
      const longName = 'N'.repeat(101);

      const res = await request(app)
        .post('/api/accounts')
        .set('Authorization', `Bearer ${user.token}`)
        .send({ accountType: 'bank', accountName: longName });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('TC-Acc-01-VAL-06: rejects non-numeric openingBalance with 400', async () => {
      const user = await createTestUser('Val6');

      const res = await request(app)
        .post('/api/accounts')
        .set('Authorization', `Bearer ${user.token}`)
        .send({ accountType: 'bank', accountName: 'Savings', openingBalance: 'invalid-amount' });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('TC-Acc-01-VAL-07: rejects openingBalance with more than two decimal places (e.g., 100.999)', async () => {
      const user = await createTestUser('Val7');

      const res = await request(app)
        .post('/api/accounts')
        .set('Authorization', `Bearer ${user.token}`)
        .send({ accountType: 'bank', accountName: 'Precision Test', openingBalance: 100.999 });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('TC-Acc-01-VAL-08: accepts maximum allowed balance (9,999,999,999.99) and rejects amounts beyond it', async () => {
      const user = await createTestUser('Val8');

      // Max allowed
      const maxRes = await request(app)
        .post('/api/accounts')
        .set('Authorization', `Bearer ${user.token}`)
        .send({ accountType: 'bank', accountName: 'Max Balance Account', openingBalance: 9999999999.99 });
      expect(maxRes.status).toBe(201);
      expect(maxRes.body.account.balance).toBe(9999999999.99);

      // Exceeding max
      const overRes = await request(app)
        .post('/api/accounts')
        .set('Authorization', `Bearer ${user.token}`)
        .send({ accountType: 'bank', accountName: 'Over Limit Account', openingBalance: 10000000000.0 });
      expect(overRes.status).toBe(400);
      expect(overRes.body.error.code).toBe('VALIDATION_ERROR');
    });
  });

  describe('Multi-User Isolation & Ownership Protection', () => {
    it('TC-Acc-01-SEC-01: ensures strict user isolation — User B cannot see User A accounts', async () => {
      const userA = await createTestUser('UserA');
      const userB = await createTestUser('UserB');

      // User A creates 2 accounts
      await request(app)
        .post('/api/accounts')
        .set('Authorization', `Bearer ${userA.token}`)
        .send({ accountType: 'bank', accountName: 'User A Private Bank', openingBalance: 50000 });
      await request(app)
        .post('/api/accounts')
        .set('Authorization', `Bearer ${userA.token}`)
        .send({ accountType: 'cash', accountName: 'User A Secret Cash', openingBalance: 1000 });

      // User B creates 1 account
      await request(app)
        .post('/api/accounts')
        .set('Authorization', `Bearer ${userB.token}`)
        .send({ accountType: 'wallet', accountName: 'User B Only Wallet', openingBalance: 250 });

      // User B lists accounts
      const listB = await request(app)
        .get('/api/accounts')
        .set('Authorization', `Bearer ${userB.token}`);

      expect(listB.status).toBe(200);
      expect(listB.body.accounts.length).toBe(1);
      expect(listB.body.accounts[0].accountName).toBe('User B Only Wallet');
      expect(listB.body.accounts[0].userId).toBe(userB.userId);

      // Verify none of User A's accounts appear in User B's response
      const hasUserAData = listB.body.accounts.some(
        (a) => a.accountName.includes('User A') || a.userId === userA.userId
      );
      expect(hasUserAData).toBe(false);
    });

    it('TC-Acc-01-SEC-02: returns empty array when authenticated user has created no accounts', async () => {
      const emptyUser = await createTestUser('EmptyUser');

      const res = await request(app)
        .get('/api/accounts')
        .set('Authorization', `Bearer ${emptyUser.token}`);

      expect(res.status).toBe(200);
      expect(res.body.accounts).toEqual([]);
    });
  });

  describe('Authentication & Token Security Verification', () => {
    it('TC-Acc-01-AUTH-01: rejects request without Authorization header with 401', async () => {
      const res = await request(app).get('/api/accounts');
      expect(res.status).toBe(401);
      expect(res.body.error).toBeDefined();
      expect(res.body.error.code).toBe('MISSING_AUTHORIZATION');
    });

    it('TC-Acc-01-AUTH-02: rejects request with non-Bearer token scheme with 401', async () => {
      const res = await request(app)
        .get('/api/accounts')
        .set('Authorization', 'Basic dXNlcjpwYXNz');
      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe('INVALID_AUTHORIZATION');
    });

    it('TC-Acc-01-AUTH-03: rejects request with invalid/forged signature with 401', async () => {
      const forgedToken = jwt.sign(
        { userId: 'fake_user', role: 'user', tokenType: 'access' },
        'wrong-secret-key-12345678901234567890'
      );

      const res = await request(app)
        .get('/api/accounts')
        .set('Authorization', `Bearer ${forgedToken}`);
      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe('INVALID_TOKEN');
    });

    it('TC-Acc-01-AUTH-04: rejects request with expired token with 401', async () => {
      const expiredToken = jwt.sign(
        { userId: 'usr_expired', role: 'user', tokenType: 'access' },
        config.jwtSecret,
        { expiresIn: '-1s' }
      );

      const res = await request(app)
        .post('/api/accounts')
        .set('Authorization', `Bearer ${expiredToken}`)
        .send({ accountType: 'cash', accountName: 'Expired Token Test' });

      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe('INVALID_TOKEN');
    });
  });
});
