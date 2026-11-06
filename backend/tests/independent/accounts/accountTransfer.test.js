/**
 * Independent Black-Box Test Suite
 *
 * Story: S2-07 — Accounts: Atomic account-to-account transfer
 * Issue: #32
 * Requirement: SEBM-F-031
 * Acceptance Criterion: AC-SEBM-F-031:
 *   "Source account is debited and destination account is credited by the same amount; transfer is rejected if the source balance is insufficient. Test: TC-Acc-02"
 * Test Case: TC-Acc-02
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

describe('TC-Acc-02 / SEBM-F-031 — Independent Account Transfer Verification', () => {
  const createdUserIds = [];
  const testRunId = `indep_xfer_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;

  const createTestUserWithTwoAccounts = async (nameSuffix, bal1 = 1000.0, bal2 = 500.0) => {
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

    const acc1Res = await request(app)
      .post('/api/accounts')
      .set('Authorization', `Bearer ${token}`)
      .send({ accountType: 'bank', accountName: `Source Acc ${nameSuffix}`, openingBalance: bal1 });

    const acc2Res = await request(app)
      .post('/api/accounts')
      .set('Authorization', `Bearer ${token}`)
      .send({ accountType: 'wallet', accountName: `Dest Acc ${nameSuffix}`, openingBalance: bal2 });

    return {
      userId,
      email,
      token,
      fromAccount: acc1Res.body.account,
      toAccount: acc2Res.body.account,
    };
  };

  afterAll(async () => {
    if (createdUserIds.length > 0) {
      await db.query('DELETE FROM users WHERE user_id = ANY($1)', [createdUserIds]);
    }
    await db.closePool();
  });

  describe('AC-SEBM-F-031 Core Requirements (Debit, Credit & Balance Conservation)', () => {
    it('TC-Acc-02-HP-01: debits source, credits destination by the same amount, and conserves total balance', async () => {
      const user = await createTestUserWithTwoAccounts('HappyTransfer', 1000.0, 500.0);
      const transferAmount = 300.5;

      const totalBefore = 1000.0 + 500.0;

      const res = await request(app)
        .post('/api/accounts/transfer')
        .set('Authorization', `Bearer ${user.token}`)
        .send({
          fromAccountId: user.fromAccount.accountId,
          toAccountId: user.toAccount.accountId,
          amount: transferAmount,
        });

      expect(res.status).toBe(201);
      expect(res.body.transferId).toBeDefined();
      expect(res.body.fromAccountBalance).toBe(699.5); // 1000.00 - 300.50
      expect(res.body.toAccountBalance).toBe(800.5); // 500.00 + 300.50

      // Balance conservation check
      expect(res.body.fromAccountBalance + res.body.toAccountBalance).toBe(totalBefore);

      // Verify real PostgreSQL balances
      const dbFrom = await db.query('SELECT balance FROM accounts WHERE account_id = $1', [user.fromAccount.accountId]);
      const dbTo = await db.query('SELECT balance FROM accounts WHERE account_id = $1', [user.toAccount.accountId]);
      expect(Number(dbFrom.rows[0].balance)).toBe(699.5);
      expect(Number(dbTo.rows[0].balance)).toBe(800.5);

      // Verify transfers audit table record
      const dbTransfer = await db.query('SELECT * FROM transfers WHERE transfer_id = $1', [res.body.transferId]);
      expect(dbTransfer.rows.length).toBe(1);
      expect(dbTransfer.rows[0].user_id).toBe(user.userId);
      expect(dbTransfer.rows[0].from_account_id).toBe(user.fromAccount.accountId);
      expect(dbTransfer.rows[0].to_account_id).toBe(user.toAccount.accountId);
      expect(Number(dbTransfer.rows[0].amount)).toBe(transferAmount);
    });

    it('TC-Acc-02-HP-02: allows transferring entire balance (exact balance transfer down to 0.00)', async () => {
      const user = await createTestUserWithTwoAccounts('FullDrain', 250.0, 100.0);

      const res = await request(app)
        .post('/api/accounts/transfer')
        .set('Authorization', `Bearer ${user.token}`)
        .send({
          fromAccountId: user.fromAccount.accountId,
          toAccountId: user.toAccount.accountId,
          amount: 250.0,
        });

      expect(res.status).toBe(201);
      expect(res.body.fromAccountBalance).toBe(0.0);
      expect(res.body.toAccountBalance).toBe(350.0);

      const dbFrom = await db.query('SELECT balance FROM accounts WHERE account_id = $1', [user.fromAccount.accountId]);
      expect(Number(dbFrom.rows[0].balance)).toBe(0.0);
    });
  });

  describe('AC-SEBM-F-031 Insufficient Funds & Rollback Guarantee', () => {
    it('TC-Acc-02-ROLL-01: rejects transfer if source balance is insufficient with 422 INSUFFICIENT_FUNDS and rolls back completely', async () => {
      const user = await createTestUserWithTwoAccounts('InsuffFunds', 100.0, 500.0);

      // Attempt to transfer 100.01 (1 cent more than available)
      const res = await request(app)
        .post('/api/accounts/transfer')
        .set('Authorization', `Bearer ${user.token}`)
        .send({
          fromAccountId: user.fromAccount.accountId,
          toAccountId: user.toAccount.accountId,
          amount: 100.01,
        });

      expect(res.status).toBe(422);
      expect(res.body.error).toBeDefined();
      expect(res.body.error.code).toBe('INSUFFICIENT_FUNDS');

      // Verify source balance untouched at exactly 100.00
      const dbFrom = await db.query('SELECT balance FROM accounts WHERE account_id = $1', [user.fromAccount.accountId]);
      expect(Number(dbFrom.rows[0].balance)).toBe(100.0);

      // Verify destination balance untouched at exactly 500.00
      const dbTo = await db.query('SELECT balance FROM accounts WHERE account_id = $1', [user.toAccount.accountId]);
      expect(Number(dbTo.rows[0].balance)).toBe(500.0);

      // Verify no transfer record in database
      const dbTransfers = await db.query(
        'SELECT COUNT(*) FROM transfers WHERE from_account_id = $1',
        [user.fromAccount.accountId]
      );
      expect(Number(dbTransfers.rows[0].count)).toBe(0);
    });
  });

  describe('Validation & Boundary Enforcement', () => {
    it('TC-Acc-02-VAL-01: rejects transfer between the same account (source === destination) with 400', async () => {
      const user = await createTestUserWithTwoAccounts('SameAcc', 500.0, 500.0);

      const res = await request(app)
        .post('/api/accounts/transfer')
        .set('Authorization', `Bearer ${user.token}`)
        .send({
          fromAccountId: user.fromAccount.accountId,
          toAccountId: user.fromAccount.accountId,
          amount: 50.0,
        });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('TC-Acc-02-VAL-02: rejects missing or invalid amounts (zero, negative, >2 decimals, non-numeric) with 400', async () => {
      const user = await createTestUserWithTwoAccounts('ValAmounts', 1000.0, 500.0);

      const invalidAmounts = [0, -10, -0.01, 10.999, 'abc', null, undefined, ''];
      for (const amount of invalidAmounts) {
        const res = await request(app)
          .post('/api/accounts/transfer')
          .set('Authorization', `Bearer ${user.token}`)
          .send({
            fromAccountId: user.fromAccount.accountId,
            toAccountId: user.toAccount.accountId,
            amount,
          });

        expect(res.status).toBe(400);
        expect(res.body.error.code).toBe('VALIDATION_ERROR');
      }

      // Check balances are completely unaffected
      const dbFrom = await db.query('SELECT balance FROM accounts WHERE account_id = $1', [user.fromAccount.accountId]);
      expect(Number(dbFrom.rows[0].balance)).toBe(1000.0);
    });

    it('TC-Acc-02-VAL-03: rejects missing fromAccountId or toAccountId with 400 VALIDATION_ERROR', async () => {
      const user = await createTestUserWithTwoAccounts('MissingIds', 500.0, 500.0);

      const res1 = await request(app)
        .post('/api/accounts/transfer')
        .set('Authorization', `Bearer ${user.token}`)
        .send({ toAccountId: user.toAccount.accountId, amount: 50.0 });
      expect(res1.status).toBe(400);
      expect(res1.body.error.code).toBe('VALIDATION_ERROR');

      const res2 = await request(app)
        .post('/api/accounts/transfer')
        .set('Authorization', `Bearer ${user.token}`)
        .send({ fromAccountId: user.fromAccount.accountId, amount: 50.0 });
      expect(res2.status).toBe(400);
      expect(res2.body.error.code).toBe('VALIDATION_ERROR');
    });
  });

  describe('Multi-User Security & Cross-Account Isolation', () => {
    it('TC-Acc-02-SEC-01: User B cannot transfer from User A account (theft attempt)', async () => {
      const userA = await createTestUserWithTwoAccounts('UserA', 1000.0, 500.0);
      const userB = await createTestUserWithTwoAccounts('UserB', 200.0, 100.0);

      // User B attempts to transfer funds out of User A's account into User B's account
      const res = await request(app)
        .post('/api/accounts/transfer')
        .set('Authorization', `Bearer ${userB.token}`)
        .send({
          fromAccountId: userA.fromAccount.accountId,
          toAccountId: userB.toAccount.accountId,
          amount: 500.0,
        });

      // Must fail with 404 ACCOUNT_NOT_FOUND (user cannot act on accounts they do not own)
      expect(res.status).toBe(404);
      expect(res.body.error.code).toBe('ACCOUNT_NOT_FOUND');

      // User A's balance must remain 1000.00
      const dbFrom = await db.query('SELECT balance FROM accounts WHERE account_id = $1', [userA.fromAccount.accountId]);
      expect(Number(dbFrom.rows[0].balance)).toBe(1000.0);

      // User B's balance must remain 100.00
      const dbTo = await db.query('SELECT balance FROM accounts WHERE account_id = $1', [userB.toAccount.accountId]);
      expect(Number(dbTo.rows[0].balance)).toBe(100.0);
    });

    it('TC-Acc-02-SEC-02: transfer where destination account belongs to another user is rejected and preserves balances', async () => {
      const userA = await createTestUserWithTwoAccounts('SenderA', 1000.0, 500.0);
      const userB = await createTestUserWithTwoAccounts('ReceiverB', 700.0, 300.0);

      // User A attempts to transfer 250.00 from User A's source account to User B's account
      const res = await request(app)
        .post('/api/accounts/transfer')
        .set('Authorization', `Bearer ${userA.token}`)
        .send({
          fromAccountId: userA.fromAccount.accountId,
          toAccountId: userB.fromAccount.accountId,
          amount: 250.0,
        });

      // Must fail with 404 ACCOUNT_NOT_FOUND (user cannot transfer to accounts not in their ownership)
      expect(res.status).toBe(404);
      expect(res.body.error.code).toBe('ACCOUNT_NOT_FOUND');

      // User A source account balance must remain unchanged at 1000.00
      const dbFromA = await db.query('SELECT balance FROM accounts WHERE account_id = $1', [userA.fromAccount.accountId]);
      expect(Number(dbFromA.rows[0].balance)).toBe(1000.0);

      // User B account balance must remain unchanged at 700.00
      const dbFromB = await db.query('SELECT balance FROM accounts WHERE account_id = $1', [userB.fromAccount.accountId]);
      expect(Number(dbFromB.rows[0].balance)).toBe(700.0);

      // No transfer record should exist in transfers table
      const dbTransfers = await db.query(
        'SELECT COUNT(*) FROM transfers WHERE from_account_id = $1 OR to_account_id = $2',
        [userA.fromAccount.accountId, userB.fromAccount.accountId]
      );
      expect(Number(dbTransfers.rows[0].count)).toBe(0);
    });
  });

  describe('Authentication Enforcement', () => {
    it('TC-Acc-02-AUTH-01: rejects unauthenticated transfer requests with 401 MISSING_AUTHORIZATION', async () => {
      const res = await request(app)
        .post('/api/accounts/transfer')
        .send({ fromAccountId: 'acc_1', toAccountId: 'acc_2', amount: 50.0 });

      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe('MISSING_AUTHORIZATION');
    });

    it('TC-Acc-02-AUTH-02: rejects transfer request with non-Bearer token scheme with 401 INVALID_AUTHORIZATION', async () => {
      const res = await request(app)
        .post('/api/accounts/transfer')
        .set('Authorization', 'Basic dXNlcjpwYXNzd29yZA==')
        .send({ fromAccountId: 'acc_1', toAccountId: 'acc_2', amount: 50.0 });

      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe('INVALID_AUTHORIZATION');
    });

    it('TC-Acc-02-AUTH-03: rejects forged or tampered bearer tokens with 401 INVALID_TOKEN', async () => {
      const forgedToken = jwt.sign(
        { userId: 'usr_forged_xfer', role: 'user', tokenType: 'access' },
        'completely_wrong_secret_123456789'
      );

      const res = await request(app)
        .post('/api/accounts/transfer')
        .set('Authorization', `Bearer ${forgedToken}`)
        .send({ fromAccountId: 'acc_1', toAccountId: 'acc_2', amount: 50.0 });

      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe('INVALID_TOKEN');
    });

    it('TC-Acc-02-AUTH-04: rejects transfer request with expired token with 401 INVALID_TOKEN', async () => {
      const expiredToken = jwt.sign(
        { userId: 'usr_expired', role: 'user', tokenType: 'access' },
        config.jwtSecret,
        { expiresIn: '-10s' }
      );

      const res = await request(app)
        .post('/api/accounts/transfer')
        .set('Authorization', `Bearer ${expiredToken}`)
        .send({ fromAccountId: 'acc_1', toAccountId: 'acc_2', amount: 50.0 });

      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe('INVALID_TOKEN');
    });
  });

  describe('Concurrency & Deadlock Prevention', () => {
    it('TC-Acc-02-CONC-01: concurrent opposite transfers between same two accounts do not deadlock or cause overdrafts', async () => {
      const user = await createTestUserWithTwoAccounts('OppositeXfers', 500.0, 500.0);
      const acc1Id = user.fromAccount.accountId;
      const acc2Id = user.toAccount.accountId;

      // Launch opposite transfers simultaneously:
      // Transfer A: 300.00 from Acc1 -> Acc2
      // Transfer B: 300.00 from Acc2 -> Acc1
      const req1 = request(app)
        .post('/api/accounts/transfer')
        .set('Authorization', `Bearer ${user.token}`)
        .send({ fromAccountId: acc1Id, toAccountId: acc2Id, amount: 300.0 });

      const req2 = request(app)
        .post('/api/accounts/transfer')
        .set('Authorization', `Bearer ${user.token}`)
        .send({ fromAccountId: acc2Id, toAccountId: acc1Id, amount: 300.0 });

      const [res1, res2] = await Promise.all([req1, req2]);

      expect(res1.status).toBe(201);
      expect(res2.status).toBe(201);

      // Verify PostgreSQL final balances:
      // Both accounts had 500. One lost 300 and gained 300, the other lost 300 and gained 300.
      // Net balance on each must be 500.00, total remains 1000.00!
      const dbAcc1 = await db.query('SELECT balance FROM accounts WHERE account_id = $1', [acc1Id]);
      const dbAcc2 = await db.query('SELECT balance FROM accounts WHERE account_id = $1', [acc2Id]);
      expect(Number(dbAcc1.rows[0].balance)).toBe(500.0);
      expect(Number(dbAcc2.rows[0].balance)).toBe(500.0);
      expect(Number(dbAcc1.rows[0].balance) + Number(dbAcc2.rows[0].balance)).toBe(1000.0);
    });
  });
});
