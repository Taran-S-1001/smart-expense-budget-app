jest.mock('../../src/db', () => ({
  query: jest.fn(),
  getClient: jest.fn(),
  getPool: jest.fn(),
}));

const request = require('supertest');
const app = require('../../src/app');
const config = require('../../src/config');
const db = require('../../src/db');
const { signTestToken } = require('../../src/auth/jwt');

const TEST_SECRET = 'receipts-test-secret-12345';
const originalJwtSecret = config.jwtSecret;

const user1Id = 'user-owner-1';
const user2Id = 'user-intruder-2';
const validPngDataUrl =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

describe('Receipts API Integration (SEBM-F-012, TC-Exp-03, Issue #37)', () => {
  beforeAll(() => {
    config.jwtSecret = TEST_SECRET;
  });

  afterAll(() => {
    config.jwtSecret = originalJwtSecret;
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  const authHeader = (userId, role = 'user') => `Bearer ${signTestToken(userId, role)}`;

  describe('Authentication enforcement', () => {
    it('returns 401 MISSING_AUTHORIZATION when Authorization header is absent', async () => {
      const response = await request(app)
        .post('/api/receipts/tx-123')
        .send({ imageUrl: validPngDataUrl });

      expect(response.status).toBe(401);
      expect(response.body.error.code).toBe('MISSING_AUTHORIZATION');
    });

    it('returns 401 INVALID_TOKEN when bearer token is malformed', async () => {
      const response = await request(app)
        .get('/api/receipts/tx-123')
        .set('Authorization', 'Bearer invalid.token.payload');

      expect(response.status).toBe(401);
      expect(response.body.error.code).toBe('INVALID_TOKEN');
    });
  });

  describe('POST /api/receipts/:transactionId', () => {
    it('successfully attaches a receipt to a user owned transaction', async () => {
      // Mock transaction ownership lookup: transaction exists and belongs to user1Id
      db.query.mockResolvedValueOnce({
        rows: [{ transaction_id: 'tx-100', user_id: user1Id }],
      });

      // Mock upsert receipt insert
      db.query.mockResolvedValueOnce({
        rows: [
          {
            receipt_id: 'rcpt-100',
            transaction_id: 'tx-100',
            image_url: validPngDataUrl,
            created_at: new Date('2026-10-29T10:00:00Z'),
          },
        ],
      });

      const response = await request(app)
        .post('/api/receipts/tx-100')
        .set('Authorization', authHeader(user1Id))
        .send({ imageUrl: validPngDataUrl });

      expect(response.status).toBe(201);
      expect(response.body.receipt).toBeDefined();
      expect(response.body.receipt.receiptId).toBe('rcpt-100');
      expect(response.body.receipt.transactionId).toBe('tx-100');
      expect(response.body.receipt.imageUrl).toBe(validPngDataUrl);
      expect(response.body.receipt.createdAt).toBe('2026-10-29T10:00:00.000Z');
    });

    it('returns 404 TRANSACTION_NOT_FOUND when transaction does not exist', async () => {
      db.query.mockResolvedValueOnce({ rows: [] });

      const response = await request(app)
        .post('/api/receipts/tx-nonexistent')
        .set('Authorization', authHeader(user1Id))
        .send({ imageUrl: validPngDataUrl });

      expect(response.status).toBe(404);
      expect(response.body.error).toEqual({
        code: 'TRANSACTION_NOT_FOUND',
        message: 'Transaction not found.',
      });
    });

    it('returns 403 FORBIDDEN when user attempts to attach receipt to another user transaction', async () => {
      // Transaction belongs to user1Id, but user2Id makes the request
      db.query.mockResolvedValueOnce({
        rows: [{ transaction_id: 'tx-100', user_id: user1Id }],
      });

      const response = await request(app)
        .post('/api/receipts/tx-100')
        .set('Authorization', authHeader(user2Id))
        .send({ imageUrl: validPngDataUrl });

      expect(response.status).toBe(403);
      expect(response.body.error).toEqual({
        code: 'FORBIDDEN',
        message: 'Access denied: transaction belongs to another user.',
      });
    });

    it('returns 400 UNSUPPORTED_MEDIA_TYPE when image format is not PNG, JPEG, or WebP', async () => {
      const gifDataUrl = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';

      const response = await request(app)
        .post('/api/receipts/tx-100')
        .set('Authorization', authHeader(user1Id))
        .send({ imageUrl: gifDataUrl });

      expect(response.status).toBe(400);
      expect(response.body.error.code).toBe('UNSUPPORTED_MEDIA_TYPE');
      expect(response.body.error.message).toContain('Only PNG, JPEG, and WebP');
      expect(db.query).not.toHaveBeenCalled();
    });

    it('successfully attaches a valid near-limit receipt image (~1 MB decoded, ~1.4 MB payload)', async () => {
      // 1,048,572 bytes decoded = 1,398,096 base64 chars (multiple of 4) <= 1,048,576 bytes
      // Total JSON body ~1.4 MB, which requires express.json limit > 1mb to parse
      const nearLimitBase64 = 'A'.repeat(1398096);
      const nearLimitDataUrl = `data:image/png;base64,${nearLimitBase64}`;

      db.query
        .mockResolvedValueOnce({
          rows: [{ transaction_id: 'tx-100', user_id: user1Id }],
        })
        .mockResolvedValueOnce({
          rows: [
            {
              receipt_id: 'rec-near-limit',
              transaction_id: 'tx-100',
              image_url: nearLimitDataUrl,
              created_at: new Date().toISOString(),
            },
          ],
        });

      const response = await request(app)
        .post('/api/receipts/tx-100')
        .set('Authorization', authHeader(user1Id))
        .send({ imageUrl: nearLimitDataUrl });

      expect(response.status).toBe(201);
      expect(response.body).toHaveProperty('receipt');
      expect(response.body.receipt.receiptId).toBe('rec-near-limit');
      expect(db.query).toHaveBeenCalledTimes(2);
    });

    it('returns 413 PAYLOAD_TOO_LARGE when decoded image exceeds 1 MB', async () => {
      // 1,400,000 base64 chars = ~1.05 MB decoded (> 1 MB limit)
      // Express parses the JSON (~1.4 MB < 2 MB limit), and receiptService enforces 1 MB decoded limit
      const oversizedDataUrl = `data:image/png;base64,${'A'.repeat(1400000)}`;

      const response = await request(app)
        .post('/api/receipts/tx-100')
        .set('Authorization', authHeader(user1Id))
        .send({ imageUrl: oversizedDataUrl });

      expect(response.status).toBe(413);
      expect(response.body.error).toEqual({
        code: 'PAYLOAD_TOO_LARGE',
        message: 'Image size exceeds the allowed limit (max 1 MB).',
      });
      expect(db.query).not.toHaveBeenCalled();
    });

    it('returns 400 VALIDATION_ERROR when imageUrl is missing', async () => {
      const response = await request(app)
        .post('/api/receipts/tx-100')
        .set('Authorization', authHeader(user1Id))
        .send({});

      expect(response.status).toBe(400);
      expect(response.body.error.code).toBe('VALIDATION_ERROR');
    });
  });

  describe('GET /api/receipts/:transactionId', () => {
    it('returns receipt details when transaction belongs to user and receipt exists', async () => {
      // 1. Transaction ownership check
      db.query.mockResolvedValueOnce({
        rows: [{ transaction_id: 'tx-100', user_id: user1Id }],
      });

      // 2. Receipt query
      db.query.mockResolvedValueOnce({
        rows: [
          {
            receipt_id: 'rcpt-100',
            transaction_id: 'tx-100',
            image_url: validPngDataUrl,
            created_at: new Date('2026-10-29T10:00:00Z'),
          },
        ],
      });

      const response = await request(app)
        .get('/api/receipts/tx-100')
        .set('Authorization', authHeader(user1Id));

      expect(response.status).toBe(200);
      expect(response.body.receipt).toBeDefined();
      expect(response.body.receipt.receiptId).toBe('rcpt-100');
      expect(response.body.receipt.transactionId).toBe('tx-100');
      expect(response.body.receipt.imageUrl).toBe(validPngDataUrl);
      expect(response.body.receipt.createdAt).toBe('2026-10-29T10:00:00.000Z');
    });

    it('returns 404 RECEIPT_NOT_FOUND when transaction exists but no receipt is attached', async () => {
      // 1. Transaction ownership check succeeds
      db.query.mockResolvedValueOnce({
        rows: [{ transaction_id: 'tx-100', user_id: user1Id }],
      });

      // 2. Receipt query returns empty
      db.query.mockResolvedValueOnce({ rows: [] });

      const response = await request(app)
        .get('/api/receipts/tx-100')
        .set('Authorization', authHeader(user1Id));

      expect(response.status).toBe(404);
      expect(response.body.error).toEqual({
        code: 'RECEIPT_NOT_FOUND',
        message: 'No receipt found for this transaction.',
      });
    });

    it('returns 404 TRANSACTION_NOT_FOUND when transaction does not exist', async () => {
      db.query.mockResolvedValueOnce({ rows: [] });

      const response = await request(app)
        .get('/api/receipts/tx-missing')
        .set('Authorization', authHeader(user1Id));

      expect(response.status).toBe(404);
      expect(response.body.error.code).toBe('TRANSACTION_NOT_FOUND');
    });

    it('returns 403 FORBIDDEN when user attempts to view receipt for another user transaction', async () => {
      db.query.mockResolvedValueOnce({
        rows: [{ transaction_id: 'tx-100', user_id: user1Id }],
      });

      const response = await request(app)
        .get('/api/receipts/tx-100')
        .set('Authorization', authHeader(user2Id));

      expect(response.status).toBe(403);
      expect(response.body.error).toEqual({
        code: 'FORBIDDEN',
        message: 'Access denied: transaction belongs to another user.',
      });
    });
  });
});
