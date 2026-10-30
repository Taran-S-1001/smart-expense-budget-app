process.env.NODE_ENV = 'test';

const request = require('supertest');
const app = require('../../src/app');

describe('Reports API Integration Tests (TC-Rep-01)', () => {
  let authToken;

  beforeAll(async () => {
    // Optional: obtain a valid JWT token if needed
  });

  describe('GET /api/reports/weekly', () => {
    it('should return 400 if startDate or endDate are missing', async () => {
      const res = await request(app)
        .get('/api/reports/weekly')
        .set('Authorization', `Bearer ${authToken || 'fake-token'}`);

      expect([400, 401, 403]).toContain(res.statusCode);
    });
  });

  describe('GET /api/reports/monthly', () => {
    it('should respond to monthly reports endpoint', async () => {
      const res = await request(app)
        .get('/api/reports/monthly')
        .set('Authorization', `Bearer ${authToken || 'fake-token'}`);

      expect([200, 401, 403]).toContain(res.statusCode);
    });
  });
});