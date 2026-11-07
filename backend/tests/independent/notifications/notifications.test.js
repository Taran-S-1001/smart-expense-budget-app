const request = require('supertest');
const app = require('../../../src/app');
const { signTestToken } = require('../../../src/auth/jwt');

describe('Independent Verification: Notifications (S1-08)', () => {

  test('TC-Notif-01-A: Authenticated user can retrieve notification list', async () => {
    const token = signTestToken('1', 'user');

    const res = await request(app)
      .get('/api/notifications')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('notifications');
    expect(Array.isArray(res.body.notifications)).toBe(true);
  });

  test('TC-Notif-01-B: Notification endpoint requires authentication', async () => {
    const res = await request(app)
      .get('/api/notifications');

    expect([401, 403]).toContain(res.status);
  });

  test('TC-Notif-01-C: User cannot access another user notifications', async () => {
    const token = signTestToken('1', 'user');

    const res = await request(app)
      .get('/api/notifications/user/999')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('FORBIDDEN');
  });

});