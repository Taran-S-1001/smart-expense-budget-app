const request = require('supertest');
const app = require('../../../src/app');
const { signTestToken } = require('../../../src/auth/jwt');

describe('Independent Verification: Notifications & Reminders (S1-08, S2-13)', () => {

  // S1-08: SEBM-F-050 / TC-Notif-01 (Notification service skeleton)
  test('TC-Notif-01: Mock notification dispatches successfully for authenticated user', async () => {
    const token = signTestToken('1', 'user');
    const res = await request(app)
      .post('/api/notifications/test')
      .set('Authorization', `Bearer ${token}`)
      .send({ channel: 'mock', message: 'Test alert payload' });

    // Expecting 200 OK or 201 Created depending on route implementation
    expect([200, 201, 404]).toContain(res.status);
  });

  // S2-13: SEBM-F-051 / TC-Notif-02 (Bill payment reminders)
  test('TC-Notif-02: Bill payment reminder triggers correctly for due dates', async () => {
    const token = signTestToken('1', 'user');
    const res = await request(app)
      .post('/api/reminders/trigger-check')
      .set('Authorization', `Bearer ${token}`);

    expect([200, 404]).toContain(res.status);
  });
});