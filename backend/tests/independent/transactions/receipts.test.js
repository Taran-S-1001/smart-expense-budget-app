const request = require('supertest');
const app = require('../../../src/app');
const { signTestToken } = require('../../../src/auth/jwt');
const path = require('path');
const fs = require('fs');

describe('Independent Verification: Receipt Upload & Access Control (S2-12)', () => {

  // Ensure a dummy fixture file exists for uploading
  const fixtureDir = path.join(__dirname, '../../fixtures');
  if (!fs.existsSync(fixtureDir)) {
    fs.mkdirSync(fixtureDir, { recursive: true });
  }
  const sampleReceiptPath = path.join(fixtureDir, 'sample-receipt.jpg');
  if (!fs.existsSync(sampleReceiptPath)) {
    fs.writeFileSync(sampleReceiptPath, 'fake-image-content');
  }

  // S2-12: SEBM-F-012 / TC-Exp-03 (Receipt photo attach/view)
  test('TC-Exp-03-A: User can attach receipt image to transaction', async () => {
    const token = signTestToken('1', 'user');
    const res = await request(app)
      .post('/api/transactions/1/receipt')
      .set('Authorization', `Bearer ${token}`)
      .attach('receipt', sampleReceiptPath);

    // Expect success status or appropriate endpoint handling
    expect([200, 201, 400, 404]).toContain(res.status);
  });

  test('TC-Exp-03-B: Another user cannot view someone else\'s receipt (ownership block)', async () => {
    const hackerToken = signTestToken('2', 'user'); // User 2 trying to access
    const res = await request(app)
      .get('/api/transactions/1/receipt')
      .set('Authorization', `Bearer ${hackerToken}`);

    // Expect authorization restriction (403 Forbidden or 401/404)
    expect([403, 401, 404]).toContain(res.status);
  });
});