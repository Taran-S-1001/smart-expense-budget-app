
const request = require('supertest');
const app = require('../../../src/app');

describe('Independent Verification: Security Headers', () => {
  test('TC-Sec-07: HTTP responses include required security headers', async () => {
    const res = await request(app).get('/health');

    expect(res.status).toBe(200);

    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['x-frame-options']).toBe('DENY');
    expect(res.headers['referrer-policy']).toBe(
      'strict-origin-when-cross-origin'
    );
    expect(res.headers['content-security-policy']).toBe(
      "default-src 'self'"
    );

    // HSTS must not be emitted on insecure HTTP requests.
    expect(res.headers['strict-transport-security']).toBeUndefined();

    // Express technology header must be disabled.
    expect(res.headers['x-powered-by']).toBeUndefined();
  });
});
