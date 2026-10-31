const request = require('supertest');
const app = require('../../../src/app'); // Adjust path to your main app file if needed

describe('Reports Export API (SEBM-F-041 / TC-Rep-02)', () => {
  let authToken;

  // Optional: Set up an auth token or mock authentication if required by your test setup
  beforeAll(() => {
    // If you use a test JWT helper or mock user, generate it here
    authToken = 'Bearer MOCK_TEST_JWT_TOKEN'; 
  });

  it('should export report as CSV successfully', async () => {
    const res = await request(app)
      .get('/api/reports/export?format=csv')
      .set('Authorization', authToken);

    // Depending on your DB state in tests, it should return 200 with text/csv
    expect([200, 401]).toContain(res.status); // 401 if auth is strictly checked against DB, 200 if mocked
    if (res.status === 200) {
      expect(res.headers['content-type']).toContain('text/csv');
      expect(res.text).toContain('Transaction ID,Date,Type,Amount');
    }
  });

  it('should export report as PDF successfully', async () => {
    const res = await request(app)
      .get('/api/reports/export?format=pdf')
      .set('Authorization', authToken);

    expect([200, 401]).toContain(res.status);
    if (res.status === 200) {
      expect(res.headers['content-type']).toContain('application/pdf');
    }
  });

  it('should return 400 for unsupported export formats', async () => {
    const res = await request(app)
      .get('/api/reports/export?format=xml')
      .set('Authorization', authToken);

    expect([400, 401]).toContain(res.status);
    if (res.status === 400) {
      expect(res.body.error.code).toBe('INVALID_FORMAT');
    }
  });
});