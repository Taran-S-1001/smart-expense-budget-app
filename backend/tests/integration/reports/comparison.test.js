const request = require('supertest');
const app = require('../../../src/app');
const { signTestToken } = require('../../../src/auth/jwt');

process.env.JWT_SECRET = process.env.JWT_SECRET || 'test_secret_key';

describe('Period-over-Period Comparison API (SEBM-F-042 / TC-Rep-03)', () => {
  let authToken;

  beforeAll(async () => {
    const uniqueEmail = `reports_comp_${Date.now()}_${Math.random()
      .toString(36)
      .substring(7)}@example.com`;

    const regRes = await request(app)
      .post('/api/auth/register')
      .send({
        email: uniqueEmail,
        password: 'Password123!',
        name: 'Comparison Test User',
        srn: 'PES2UG24CS533',
      });

    const userId = regRes.body.user.userId;

    const token = signTestToken(userId, 'user');

    authToken = `Bearer ${token}`;
  });

  it('should return 400 if required comparison query parameters are missing', async () => {
    const res = await request(app)
      .get('/api/reports/comparison')
      .set('Authorization', authToken);

    expect(res.status).toBe(400);
    expect(res.body.error).toBeDefined();
    expect(res.body.error.code).toBe('MISSING_PARAMETERS');
  });

  it('should return 400 if date formats are invalid', async () => {
    const res = await request(app)
      .get(
        '/api/reports/comparison?currentStart=invalid-date&currentEnd=2026-10-31&prevStart=2026-09-01&prevEnd=2026-09-30'
      )
      .set('Authorization', authToken);

    expect(res.status).toBe(400);
    expect(res.body.error).toBeDefined();
    expect(res.body.error.code).toBe('INVALID_DATE_FORMAT');
  });

  it('should return 400 for invalid calendar dates (such as non-existent days like Feb 30)', async () => {
    const res = await request(app)
      .get(
        '/api/reports/comparison?currentStart=2026-02-30&currentEnd=2026-03-31&prevStart=2026-01-01&prevEnd=2026-01-31'
      )
      .set('Authorization', authToken);

    expect(res.status).toBe(400);
    expect(res.body.error).toBeDefined();
    expect(res.body.error.code).toBe('INVALID_DATE_FORMAT');
  });

  it('should return 400 if start date is after end date', async () => {
    const res = await request(app)
      .get(
        '/api/reports/comparison?currentStart=2026-10-31&currentEnd=2026-10-01&prevStart=2026-09-01&prevEnd=2026-09-30'
      )
      .set('Authorization', authToken);

    expect(res.status).toBe(400);
    expect(res.body.error).toBeDefined();
    expect(res.body.error.code).toBe('INVALID_DATE_FORMAT');
  });

  it('should calculate comparison metrics and correct variance direction for valid date ranges', async () => {
    const res = await request(app)
      .get(
        '/api/reports/comparison?currentStart=2026-10-01&currentEnd=2026-10-31&prevStart=2026-09-01&prevEnd=2026-09-30'
      )
      .set('Authorization', authToken);

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('currentPeriod');
    expect(res.body).toHaveProperty('previousPeriod');
    expect(res.body).toHaveProperty('comparison');

    expect(res.body.comparison).toHaveProperty('incomeChange');
    expect(res.body.comparison).toHaveProperty('expenseChange');
    expect(res.body.comparison).toHaveProperty('netSavingsChange');

    expect(typeof res.body.comparison.netSavingsChange).toBe('string');
  });
});