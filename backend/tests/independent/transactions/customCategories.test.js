/**
 * Independent Black-Box Test Suite
 *
 * Story: S2-06 — Transactions: Predefined and custom categories
 * Issue: #31
 * Requirement: SEBM-F-013
 * Acceptance Criterion: AC-SEBM-F-013:
 *   "New custom category is available for selection when adding future transactions. Test: TC-Exp-04"
 * Test Case: TC-Exp-04
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

describe('TC-Exp-04 / SEBM-F-013 — Independent Custom Categories Verification', () => {
  const createdUserIds = [];
  const testRunId = `indep_cat_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;

  const createTestUser = async (nameSuffix) => {
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
    return { userId, email, token };
  };

  afterAll(async () => {
    if (createdUserIds.length > 0) {
      await db.query('DELETE FROM users WHERE user_id = ANY($1)', [createdUserIds]);
    }
    await db.closePool();
  });

  describe('AC-SEBM-F-013 Core Requirements (Create Custom Category & Use in Transactions)', () => {
    it('TC-Exp-04-HP-01: retrieves predefined system categories seeded in database', async () => {
      const user = await createTestUser('PredefinedTest');

      const res = await request(app)
        .get('/api/transactions/categories')
        .set('Authorization', `Bearer ${user.token}`);

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body.categories)).toBe(true);
      expect(res.body.categories.length).toBeGreaterThan(0);

      // Verify category items have required fields
      res.body.categories.forEach((cat) => {
        expect(cat.categoryId).toBeDefined();
        expect(cat.name).toBeDefined();
        expect(['expense', 'income']).toContain(cat.type);
      });
    });

    it('TC-Exp-04-HP-02: creates custom expense category and makes it available in category list', async () => {
      const user = await createTestUser('CustomCat');
      const catName = `Gym & Fitness ${testRunId}`;

      // Create custom category
      const createRes = await request(app)
        .post('/api/transactions/categories')
        .set('Authorization', `Bearer ${user.token}`)
        .send({
          name: catName,
          type: 'expense',
        });

      expect(createRes.status).toBe(201);
      expect(createRes.body.category).toBeDefined();
      expect(createRes.body.category.name).toBe(catName);
      expect(createRes.body.category.type).toBe('expense');

      const customCatId = createRes.body.category.categoryId;

      // Verify it appears in GET /api/transactions/categories
      const listRes = await request(app)
        .get('/api/transactions/categories')
        .set('Authorization', `Bearer ${user.token}`);

      expect(listRes.status).toBe(200);
      const found = listRes.body.categories.find((c) => c.categoryId === customCatId);
      expect(found).toBeDefined();
      expect(found.name).toBe(catName);
      expect(found.type).toBe('expense');

      // Verify real PostgreSQL record
      const dbRow = await db.query(
        'SELECT category_id, name, type, is_custom, user_id FROM categories WHERE category_id = $1',
        [customCatId]
      );
      expect(dbRow.rows.length).toBe(1);
      expect(dbRow.rows[0].name).toBe(catName);
      expect(dbRow.rows[0].is_custom).toBe(true);
      expect(dbRow.rows[0].user_id).toBe(user.userId);
    });

    it('TC-Exp-04-HP-03: AC-SEBM-F-013: newly created custom category can be selected when adding future transactions', async () => {
      const user = await createTestUser('UseCustomCat');

      // 1. Create account
      const accRes = await request(app)
        .post('/api/accounts')
        .set('Authorization', `Bearer ${user.token}`)
        .send({ accountType: 'bank', accountName: 'Test Bank', openingBalance: 1000.0 });
      const accountId = accRes.body.account.accountId;

      // 2. Create custom income category
      const customCatName = `Side Hustle ${testRunId}`;
      const catRes = await request(app)
        .post('/api/transactions/categories')
        .set('Authorization', `Bearer ${user.token}`)
        .send({ name: customCatName, type: 'income' });
      expect(catRes.status).toBe(201);
      const customCatId = catRes.body.category.categoryId;

      // 3. Post transaction selecting the new custom category
      const txnRes = await request(app)
        .post('/api/transactions')
        .set('Authorization', `Bearer ${user.token}`)
        .send({
          accountId,
          categoryId: customCatId,
          amount: 750.0,
          date: '2026-10-28',
          type: 'income',
          notes: 'Side hustle project payment',
        });

      expect(txnRes.status).toBe(201);
      const returnedCatId = txnRes.body.categoryId || txnRes.body.transaction?.categoryId;
      expect(returnedCatId).toBe(customCatId);
      expect(txnRes.body.newBalance).toBe(1750.0);

      // Verify transaction list shows custom category id
      const listTxnRes = await request(app)
        .get('/api/transactions')
        .set('Authorization', `Bearer ${user.token}`);
      const foundTxn = listTxnRes.body.transactions.find((t) => t.categoryId === customCatId);
      expect(foundTxn).toBeDefined();
      expect(foundTxn.amount).toBe(750.0);
    });
  });

  describe('Validation & Boundary Verification', () => {
    it('TC-Exp-04-VAL-01: rejects missing or empty category name with 400 VALIDATION_ERROR', async () => {
      const user = await createTestUser('ValCatName');

      // Missing name
      const res1 = await request(app)
        .post('/api/transactions/categories')
        .set('Authorization', `Bearer ${user.token}`)
        .send({ type: 'expense' });
      expect(res1.status).toBe(400);
      expect(res1.body.error.code).toBe('VALIDATION_ERROR');

      // Empty string / whitespace
      const res2 = await request(app)
        .post('/api/transactions/categories')
        .set('Authorization', `Bearer ${user.token}`)
        .send({ name: '   ', type: 'expense' });
      expect(res2.status).toBe(400);
      expect(res2.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('TC-Exp-04-VAL-02: rejects category name exceeding 100 characters with 400', async () => {
      const user = await createTestUser('ValLongName');
      const longName = 'C'.repeat(101);

      const res = await request(app)
        .post('/api/transactions/categories')
        .set('Authorization', `Bearer ${user.token}`)
        .send({ name: longName, type: 'expense' });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('TC-Exp-04-VAL-03: rejects invalid category type (e.g., neither expense nor income) with 400', async () => {
      const user = await createTestUser('ValCatType');

      const invalidTypes = ['transfer', 'investment', 'custom', 123, ''];
      for (const type of invalidTypes) {
        const res = await request(app)
          .post('/api/transactions/categories')
          .set('Authorization', `Bearer ${user.token}`)
          .send({ name: 'Some Category', type });
        expect(res.status).toBe(400);
        expect(res.body.error.code).toBe('VALIDATION_ERROR');
      }
    });

    it('TC-Exp-04-VAL-04: rejects duplicate category with same name, type, and user', async () => {
      const user = await createTestUser('DupCat');
      const catName = `Unique Cat ${testRunId}`;

      // First creation -> 201
      const res1 = await request(app)
        .post('/api/transactions/categories')
        .set('Authorization', `Bearer ${user.token}`)
        .send({ name: catName, type: 'expense' });
      expect(res1.status).toBe(201);

      // Second creation of exact duplicate -> fails with 400 or 409 or conflict error
      const res2 = await request(app)
        .post('/api/transactions/categories')
        .set('Authorization', `Bearer ${user.token}`)
        .send({ name: catName, type: 'expense' });
      expect([400, 409]).toContain(res2.status);
      expect(res2.body.error).toBeDefined();
      expect(res2.body.error.code).toBe('CATEGORY_EXISTS');
    });
  });

  describe('Multi-User Isolation & Security', () => {
    it('TC-Exp-04-SEC-01: User A custom category is NOT visible to User B', async () => {
      const userA = await createTestUser('UserACat');
      const userB = await createTestUser('UserBCat');

      const catNameA = `User A Secret Category ${testRunId}`;

      // User A creates category
      const catResA = await request(app)
        .post('/api/transactions/categories')
        .set('Authorization', `Bearer ${userA.token}`)
        .send({ name: catNameA, type: 'expense' });
      expect(catResA.status).toBe(201);
      const catIdA = catResA.body.category.categoryId;

      // User B lists categories
      const listResB = await request(app)
        .get('/api/transactions/categories')
        .set('Authorization', `Bearer ${userB.token}`);

      expect(listResB.status).toBe(200);
      const foundInB = listResB.body.categories.some((c) => c.categoryId === catIdA || c.name === catNameA);
      expect(foundInB).toBe(false);
    });

    it('TC-Exp-04-SEC-02: User B cannot use User A custom category in a transaction', async () => {
      const userA = await createTestUser('UserACatOwner');
      const userB = await createTestUser('UserBAttacker');

      // User B creates an account
      const accResB = await request(app)
        .post('/api/accounts')
        .set('Authorization', `Bearer ${userB.token}`)
        .send({ accountType: 'bank', accountName: 'User B Bank', openingBalance: 500.0 });
      const accIdB = accResB.body.account.accountId;

      // User A creates a custom expense category
      const catResA = await request(app)
        .post('/api/transactions/categories')
        .set('Authorization', `Bearer ${userA.token}`)
        .send({ name: `Private Category ${testRunId}`, type: 'expense' });
      const catIdA = catResA.body.category.categoryId;

      // User B attempts to use User A's custom category
      const attackRes = await request(app)
        .post('/api/transactions')
        .set('Authorization', `Bearer ${userB.token}`)
        .send({
          accountId: accIdB,
          categoryId: catIdA,
          amount: 50.0,
          date: '2026-10-25',
          type: 'expense',
        });

      // Must be rejected with 400 INVALID_CATEGORY
      expect(attackRes.status).toBe(400);
      expect(attackRes.body.error.code).toBe('INVALID_CATEGORY');
    });
  });

  describe('Authentication Enforcement', () => {
    it('TC-Exp-04-AUTH-01: rejects unauthenticated requests to category endpoints with 401 MISSING_AUTHORIZATION', async () => {
      const getRes = await request(app).get('/api/transactions/categories');
      expect(getRes.status).toBe(401);
      expect(getRes.body.error.code).toBe('MISSING_AUTHORIZATION');

      const postRes = await request(app)
        .post('/api/transactions/categories')
        .send({ name: 'Test Cat', type: 'expense' });
      expect(postRes.status).toBe(401);
      expect(postRes.body.error.code).toBe('MISSING_AUTHORIZATION');
    });

    it('TC-Exp-04-AUTH-02: rejects request with non-Bearer token scheme with 401 INVALID_AUTHORIZATION', async () => {
      const getRes = await request(app)
        .get('/api/transactions/categories')
        .set('Authorization', 'Basic dXNlcjpwYXNzd29yZA==');
      expect(getRes.status).toBe(401);
      expect(getRes.body.error.code).toBe('INVALID_AUTHORIZATION');

      const postRes = await request(app)
        .post('/api/transactions/categories')
        .set('Authorization', 'Basic dXNlcjpwYXNzd29yZA==')
        .send({ name: 'Basic Auth Cat', type: 'expense' });
      expect(postRes.status).toBe(401);
      expect(postRes.body.error.code).toBe('INVALID_AUTHORIZATION');
    });

    it('TC-Exp-04-AUTH-03: rejects forged or tampered bearer tokens with 401 INVALID_TOKEN', async () => {
      const forgedToken = jwt.sign(
        { userId: 'usr_forged_cat', role: 'user', tokenType: 'access' },
        'completely_wrong_secret_123456789'
      );

      const getRes = await request(app)
        .get('/api/transactions/categories')
        .set('Authorization', `Bearer ${forgedToken}`);
      expect(getRes.status).toBe(401);
      expect(getRes.body.error.code).toBe('INVALID_TOKEN');

      const postRes = await request(app)
        .post('/api/transactions/categories')
        .set('Authorization', `Bearer ${forgedToken}`)
        .send({ name: 'Forged Cat', type: 'expense' });
      expect(postRes.status).toBe(401);
      expect(postRes.body.error.code).toBe('INVALID_TOKEN');
    });

    it('TC-Exp-04-AUTH-04: rejects category creation with expired token with 401 INVALID_TOKEN', async () => {
      const expiredToken = jwt.sign(
        { userId: 'usr_expired', role: 'user', tokenType: 'access' },
        config.jwtSecret,
        { expiresIn: '-10s' }
      );

      const res = await request(app)
        .post('/api/transactions/categories')
        .set('Authorization', `Bearer ${expiredToken}`)
        .send({ name: 'Expired Cat', type: 'expense' });

      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe('INVALID_TOKEN');
    });
  });
});
