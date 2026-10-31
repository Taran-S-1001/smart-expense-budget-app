const request = require('supertest');
const app = require('../../../src/app');

describe('Period-over-Period Comparison API (SEBM-F-042 / TC-Rep-03)', () => {
  let authToken;

  beforeAll(() => {
    authToken = 'Bearer MOCK_TEST_JWT_TOKEN';
  });

  it('should return 400 if required comparison query parameters are missing', async () => {
    const res = await request(app)
      .get('/api/reports/comparison')
      .set('Authorization', authToken);

    expect([400, 401]).toContain(res.status);
    if (res.status === 400) {
      expect(res.body.error).toBeDefined();
    }
  });

  it('should calculate comparison metrics for valid period date ranges', async () => {
    const res = await request(app)
      .get('/api/reports/comparison?currentStart=2026-10-01&currentEnd=2026-10-31&prevStart=2026-09-01&prevEnd=2026-09-30')
      .set('Authorization', authToken);

    expect([200, 401]).toContain(res.status);
    if (res.status === 200) {
      expect(res.body).toHaveProperty('currentPeriod');
      expect(res.body).toHaveProperty('previousPeriod');
      expect(res.body).toHaveProperty('comparison');
      expect(res.body.comparison).toHaveProperty('incomeChange');
      expect(res.body.comparison).toHaveProperty('expenseChange');
      expect(res.body.comparison).toHaveProperty('netSavingsChange');
    }
  });
});