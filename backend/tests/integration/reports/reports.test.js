const request = require('supertest');
const app = require('../../../src/app');
const { signTestToken } = require('../../../src/auth/jwt');

process.env.JWT_SECRET = process.env.JWT_SECRET || 'test_secret_key';

describe('Reports Export API (SEBM-F-041 / TC-Rep-02)', () => {
  let authToken;

  beforeAll(async () => {
    const uniqueEmail = `reports_export_${Date.now()}_${Math.random()
      .toString(36)
      .substring(7)}@example.com`;

    const regRes = await request(app)
      .post('/api/auth/register')
      .send({
        email: uniqueEmail,
        password: 'Password123!',
        name: 'Report Test User',
        srn: 'PES2UG24CS533',
      });

    const userId = regRes.body.user.userId;

    const token = signTestToken(userId, 'user');

    authToken = `Bearer ${token}`;
  });

  it('should export report as CSV successfully', async () => {
    const res = await request(app)
      .get('/api/reports/export?format=csv')
      .set('Authorization', authToken);

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('text/csv');
    expect(res.text).toContain('Transaction ID,Date,Type,Amount');
  });

  it('should export report as PDF successfully', async () => {
    const res = await request(app)
      .get('/api/reports/export?format=pdf')
      .set('Authorization', authToken);

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('application/pdf');
  });

  it('should return 400 for unsupported export formats', async () => {
    const res = await request(app)
      .get('/api/reports/export?format=xml')
      .set('Authorization', authToken);

    expect(res.status).toBe(400);
    expect(res.body.error).toBeDefined();
    expect(res.body.error.code).toBe('INVALID_FORMAT');
  });

  it('should return 400 for export with invalid year format', async () => {
    const res = await request(app)
      .get('/api/reports/export?format=csv&year=invalid')
      .set('Authorization', authToken);

    expect(res.status).toBe(400);
    expect(res.body.error).toBeDefined();
    expect(res.body.error.code).toBe('INVALID_YEAR_FORMAT');
  });

  it('should return 400 for export with missing date pair (only startDate provided)', async () => {
    const res = await request(app)
      .get('/api/reports/export?format=csv&startDate=2026-10-01')
      .set('Authorization', authToken);

    expect(res.status).toBe(400);
    expect(res.body.error).toBeDefined();
    expect(res.body.error.code).toBe('MISSING_PARAMETERS');
  });
});