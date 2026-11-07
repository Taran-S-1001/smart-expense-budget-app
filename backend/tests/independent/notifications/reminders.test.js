
const request = require('supertest');
const app = require('../../../src/app');
const { signTestToken } = require('../../../src/auth/jwt');

describe('Independent Verification: Bill Payment Reminders (S2-13 / TC-Notif-02)', () => {

  test('TC-Notif-02: User can create, list, and manage bill payment reminders', async () => {

    // 0. Register a unique test user
    const uniqueId = `${Date.now()}`;

    const regRes = await request(app)
      .post('/api/auth/register')
      .send({
        name: `Reminder Test User ${uniqueId}`,
        email: `reminder_${uniqueId}@test.com`,
        password: 'Password123!'
      });

    expect([200, 201]).toContain(regRes.status);

    const userId = regRes.body.user?.userId;
    expect(userId).toBeDefined();

    const token = signTestToken(userId, 'user');

    // 1. Create a bill reminder
    const createRes = await request(app)
      .post('/api/reminders')
      .set('Authorization', `Bearer ${token}`)
      .send({
        billName: 'Internet Bill',
        amount: 45.00,
        dueDate: '2026-11-20',
        frequency: 'monthly'
      });

    expect([200, 201]).toContain(createRes.status);

    const reminderId = createRes.body.reminder?.reminderId;
    expect(reminderId).toBeDefined();

    // 2. Retrieve reminders list
    const listRes = await request(app)
      .get('/api/reminders')
      .set('Authorization', `Bearer ${token}`);

    expect(listRes.status).toBe(200);
    expect(listRes.body).toBeDefined();

    // 3. Verify the created reminder appears in the list
    const reminders = Array.isArray(listRes.body)
      ? listRes.body
      : listRes.body.reminders || listRes.body.data;

    expect(Array.isArray(reminders)).toBe(true);

    const createdReminder = reminders.find(
      reminder => reminder.reminderId === reminderId
    );

    expect(createdReminder).toBeDefined();

    // 4. Delete the created reminder
    const deleteRes = await request(app)
      .delete(`/api/reminders/${reminderId}`)
      .set('Authorization', `Bearer ${token}`);

    expect([200, 204]).toContain(deleteRes.status);
  });

  test('TC-Notif-02-Auth: Unauthenticated user cannot access reminders', async () => {
    const res = await request(app).get('/api/reminders');

    expect([401, 403]).toContain(res.status);
  });

});
