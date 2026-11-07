const request = require('supertest');
const app = require('../../../src/app');
const { signTestToken } = require('../../../src/auth/jwt');

describe('TC-Exp-03 Receipt Photo Attach/View (S2-12)', () => {

  test('TC-Exp-03-A: Missing image payload returns VALIDATION_ERROR', async () => {
    const token = signTestToken('1', 'user');

    const res = await request(app)
      .post('/api/receipts/123')
      .set('Authorization', `Bearer ${token}`)
      .send({});

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  test('TC-Exp-03-B: Unsupported image type rejected', async () => {
    const token = signTestToken('1', 'user');

    const res = await request(app)
      .post('/api/receipts/123')
      .set('Authorization', `Bearer ${token}`)
      .send({
        imageUrl:
          'data:image/gif;base64,R0lGODlhAQABAAAAACw='
      });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('UNSUPPORTED_MEDIA_TYPE');
  });

  test('TC-Exp-03-C: Invalid image format rejected', async () => {
    const token = signTestToken('1', 'user');

    const res = await request(app)
      .post('/api/receipts/123')
      .set('Authorization', `Bearer ${token}`)
      .send({
        imageUrl: 'not-an-image'
      });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  test('TC-Exp-03-D: Non-existent transaction returns TRANSACTION_NOT_FOUND', async () => {
    const token = signTestToken('1', 'user');

    const res = await request(app)
      .post('/api/receipts/999999999')
      .set('Authorization', `Bearer ${token}`)
      .send({
        imageUrl:
          'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='
      });

    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('TRANSACTION_NOT_FOUND');
  });

  test('TC-Exp-03-E: Receipt endpoint requires authentication', async () => {
    const res = await request(app)
      .post('/api/receipts/123')
      .send({
        imageUrl:
          'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='
      });

    expect([401, 403]).toContain(res.status);
  });

});