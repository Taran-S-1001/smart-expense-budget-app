jest.mock('../../src/db', () => ({
  query: jest.fn(),
  getClient: jest.fn(),
  getPool: jest.fn(),
}));

const request = require('supertest');
const app = require('../../src/app');
const config = require('../../src/config');
const db = require('../../src/db');
const { signTestToken } = require('../../src/auth/jwt');
const { processDueReminders } = require('../../src/reminders/reminderScheduler');

const TEST_SECRET = 'reminders-integration-secret-test';
const originalJwtSecret = config.jwtSecret;

const user1Id = 'usr-owner-001';
const user2Id = 'usr-intruder-002';

describe('Reminders API Integration (SEBM-F-051, TC-Notif-02, Issue #38)', () => {
  beforeAll(() => {
    config.jwtSecret = TEST_SECRET;
  });

  afterAll(() => {
    config.jwtSecret = originalJwtSecret;
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  const authHeader = (userId, role = 'user') => `Bearer ${signTestToken(userId, role)}`;

  describe('Authentication enforcement', () => {
    it('returns 401 MISSING_AUTHORIZATION when Authorization header is absent', async () => {
      const response = await request(app)
        .post('/api/reminders')
        .send({
          billName: 'Broadband',
          amount: 899,
          dueDate: '2026-11-15',
        });

      expect(response.status).toBe(401);
      expect(response.body.error.code).toBe('MISSING_AUTHORIZATION');
    });

    it('returns 401 INVALID_TOKEN when bearer token is malformed', async () => {
      const response = await request(app)
        .get('/api/reminders')
        .set('Authorization', 'Bearer invalid.token.payload');

      expect(response.status).toBe(401);
      expect(response.body.error.code).toBe('INVALID_TOKEN');
    });
  });

  describe('POST /api/reminders', () => {
    it('creates a bill reminder with valid data (201)', async () => {
      const mockRow = {
        reminder_id: 'rem-101',
        user_id: user1Id,
        bill_name: 'Electricity Bill',
        amount: '1250.00',
        due_date: '2026-11-20',
        reminder_lead_days: 3,
        status: 'active',
        last_notified_at: null,
        last_notified_due_date: null,
        created_at: new Date('2026-10-31T10:00:00.000Z'),
        updated_at: new Date('2026-10-31T10:00:00.000Z'),
      };

      db.query.mockResolvedValueOnce({ rows: [mockRow] });

      const response = await request(app)
        .post('/api/reminders')
        .set('Authorization', authHeader(user1Id))
        .send({
          billName: 'Electricity Bill',
          amount: 1250,
          dueDate: '2026-11-20',
          reminderLeadDays: 3,
        });

      expect(response.status).toBe(201);
      expect(response.body.reminder).toBeDefined();
      expect(response.body.reminder.reminderId).toBe('rem-101');
      expect(response.body.reminder.billName).toBe('Electricity Bill');
      expect(response.body.reminder.amount).toBe('1250.00');
      expect(response.body.reminder.reminderLeadDays).toBe(3);
      expect(response.body.reminder.status).toBe('active');

      expect(db.query).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO bill_reminders'),
        [user1Id, 'Electricity Bill', '1250.00', '2026-11-20', 3]
      );
    });

    it('returns 400 VALIDATION_ERROR when billName is missing', async () => {
      const response = await request(app)
        .post('/api/reminders')
        .set('Authorization', authHeader(user1Id))
        .send({
          amount: 500,
          dueDate: '2026-11-20',
        });

      expect(response.status).toBe(400);
      expect(response.body.error.code).toBe('VALIDATION_ERROR');
      expect(response.body.error.message).toContain('Bill name is required');
      expect(db.query).not.toHaveBeenCalled();
    });

    it('returns 400 VALIDATION_ERROR when amount is non-positive or invalid', async () => {
      const response = await request(app)
        .post('/api/reminders')
        .set('Authorization', authHeader(user1Id))
        .send({
          billName: 'Rent',
          amount: -100,
          dueDate: '2026-11-20',
        });

      expect(response.status).toBe(400);
      expect(response.body.error.code).toBe('VALIDATION_ERROR');
      expect(response.body.error.message).toContain('Amount must be a positive number');
      expect(db.query).not.toHaveBeenCalled();
    });

    it('returns 400 VALIDATION_ERROR when dueDate is invalid', async () => {
      const response = await request(app)
        .post('/api/reminders')
        .set('Authorization', authHeader(user1Id))
        .send({
          billName: 'Rent',
          amount: 1000,
          dueDate: '2026-02-30',
        });

      expect(response.status).toBe(400);
      expect(response.body.error.code).toBe('VALIDATION_ERROR');
      expect(response.body.error.message).toContain('Due date must be a valid date');
      expect(db.query).not.toHaveBeenCalled();
    });

    it('returns 400 VALIDATION_ERROR when reminderLeadDays is 0 (must notify before due date per AC-SEBM-F-051)', async () => {
      const response = await request(app)
        .post('/api/reminders')
        .set('Authorization', authHeader(user1Id))
        .send({
          billName: 'Rent',
          amount: 1000,
          dueDate: '2026-11-20',
          reminderLeadDays: 0,
        });

      expect(response.status).toBe(400);
      expect(response.body.error.code).toBe('VALIDATION_ERROR');
      expect(response.body.error.message).toContain('Reminder lead days must be an integer between 1 and 30');
      expect(db.query).not.toHaveBeenCalled();
    });

    it('returns 400 VALIDATION_ERROR when reminderLeadDays exceeds 30', async () => {
      const response = await request(app)
        .post('/api/reminders')
        .set('Authorization', authHeader(user1Id))
        .send({
          billName: 'Rent',
          amount: 1000,
          dueDate: '2026-11-20',
          reminderLeadDays: 45,
        });

      expect(response.status).toBe(400);
      expect(response.body.error.code).toBe('VALIDATION_ERROR');
      expect(response.body.error.message).toContain('Reminder lead days must be an integer between 1 and 30');
      expect(db.query).not.toHaveBeenCalled();
    });
  });

  describe('GET /api/reminders', () => {
    it('lists reminders for authenticated user (200)', async () => {
      const mockRows = [
        {
          reminder_id: 'rem-1',
          user_id: user1Id,
          bill_name: 'Water Bill',
          amount: '450.00',
          due_date: '2026-11-10',
          reminder_lead_days: 1,
          status: 'active',
          last_notified_at: null,
          created_at: new Date('2026-10-31T09:00:00.000Z'),
          updated_at: new Date('2026-10-31T09:00:00.000Z'),
        },
      ];

      db.query.mockResolvedValueOnce({ rows: mockRows });

      const response = await request(app)
        .get('/api/reminders')
        .set('Authorization', authHeader(user1Id));

      expect(response.status).toBe(200);
      expect(response.body.reminders).toHaveLength(1);
      expect(response.body.reminders[0].billName).toBe('Water Bill');
      expect(db.query).toHaveBeenCalledWith(
        expect.stringContaining('WHERE user_id = $1'),
        [user1Id]
      );
    });

    it('filters reminders by status when query parameter is provided', async () => {
      db.query.mockResolvedValueOnce({ rows: [] });

      const response = await request(app)
        .get('/api/reminders?status=active')
        .set('Authorization', authHeader(user1Id));

      expect(response.status).toBe(200);
      expect(db.query).toHaveBeenCalledWith(
        expect.stringContaining('AND status = $2'),
        [user1Id, 'active']
      );
    });
  });

  describe('GET /api/reminders/:reminderId', () => {
    it('returns reminder details for owner', async () => {
      const mockRow = {
        reminder_id: 'rem-101',
        user_id: user1Id,
        bill_name: 'Gym Membership',
        amount: '1500.00',
        due_date: '2026-11-05',
        reminder_lead_days: 2,
        status: 'active',
        last_notified_at: null,
        created_at: new Date('2026-10-31T10:00:00.000Z'),
        updated_at: new Date('2026-10-31T10:00:00.000Z'),
      };

      db.query.mockResolvedValueOnce({ rows: [mockRow] });

      const response = await request(app)
        .get('/api/reminders/rem-101')
        .set('Authorization', authHeader(user1Id));

      expect(response.status).toBe(200);
      expect(response.body.reminder.reminderId).toBe('rem-101');
      expect(response.body.reminder.billName).toBe('Gym Membership');
    });

    it('returns 404 REMINDER_NOT_FOUND when reminder does not exist', async () => {
      db.query.mockResolvedValueOnce({ rows: [] });

      const response = await request(app)
        .get('/api/reminders/rem-unknown')
        .set('Authorization', authHeader(user1Id));

      expect(response.status).toBe(404);
      expect(response.body.error.code).toBe('REMINDER_NOT_FOUND');
    });

    it('returns 403 FORBIDDEN when user attempts to view another user reminder', async () => {
      const mockRow = {
        reminder_id: 'rem-101',
        user_id: user2Id, // Belongs to user2
        bill_name: 'Gym Membership',
        amount: '1500.00',
        due_date: '2026-11-05',
        reminder_lead_days: 2,
        status: 'active',
      };

      db.query.mockResolvedValueOnce({ rows: [mockRow] });

      const response = await request(app)
        .get('/api/reminders/rem-101')
        .set('Authorization', authHeader(user1Id)); // user1 requests it

      expect(response.status).toBe(403);
      expect(response.body.error.code).toBe('FORBIDDEN');
    });
  });

  describe('PUT /api/reminders/:reminderId', () => {
    it('updates reminder details and status to paid (200)', async () => {
      const existingRow = {
        reminder_id: 'rem-101',
        user_id: user1Id,
        bill_name: 'Gym Membership',
        amount: '1500.00',
        due_date: '2026-11-05',
        reminder_lead_days: 2,
        status: 'active',
      };

      const updatedRow = {
        ...existingRow,
        status: 'paid',
        updated_at: new Date('2026-10-31T12:00:00.000Z'),
      };

      db.query
        .mockResolvedValueOnce({ rows: [existingRow] }) // findById
        .mockResolvedValueOnce({ rows: [updatedRow] }); // update

      const response = await request(app)
        .put('/api/reminders/rem-101')
        .set('Authorization', authHeader(user1Id))
        .send({ status: 'paid' });

      expect(response.status).toBe(200);
      expect(response.body.reminder.status).toBe('paid');
    });

    it('resets notification state when dueDate is updated so revised schedule is notified', async () => {
      const existingRow = {
        reminder_id: 'rem-101',
        user_id: user1Id,
        bill_name: 'Gym Membership',
        amount: '1500.00',
        due_date: '2026-11-05',
        reminder_lead_days: 2,
        status: 'active',
        last_notified_at: '2026-11-03T10:00:00.000Z',
      };

      const updatedRow = {
        ...existingRow,
        due_date: '2026-12-05',
        last_notified_at: null,
        last_notified_due_date: null,
      };

      db.query
        .mockResolvedValueOnce({ rows: [existingRow] }) // findById
        .mockResolvedValueOnce({ rows: [updatedRow] }); // update

      const response = await request(app)
        .put('/api/reminders/rem-101')
        .set('Authorization', authHeader(user1Id))
        .send({ dueDate: '2026-12-05' });

      expect(response.status).toBe(200);
      expect(response.body.reminder.dueDate).toBe('2026-12-05');
      expect(db.query).toHaveBeenCalledWith(
        expect.stringContaining('last_notified_at = NULL'),
        expect.any(Array)
      );
    });

    it('returns 403 FORBIDDEN when updating another user reminder', async () => {
      const existingRow = {
        reminder_id: 'rem-101',
        user_id: user2Id, // belongs to user2
        bill_name: 'Gym Membership',
      };

      db.query.mockResolvedValueOnce({ rows: [existingRow] });

      const response = await request(app)
        .put('/api/reminders/rem-101')
        .set('Authorization', authHeader(user1Id))
        .send({ status: 'paid' });

      expect(response.status).toBe(403);
      expect(response.body.error.code).toBe('FORBIDDEN');
    });
  });

  describe('DELETE /api/reminders/:reminderId', () => {
    it('deletes reminder for owner (200)', async () => {
      const existingRow = {
        reminder_id: 'rem-101',
        user_id: user1Id,
        bill_name: 'Gym Membership',
      };

      db.query
        .mockResolvedValueOnce({ rows: [existingRow] }) // findById
        .mockResolvedValueOnce({ rows: [{ reminder_id: 'rem-101' }] }); // delete

      const response = await request(app)
        .delete('/api/reminders/rem-101')
        .set('Authorization', authHeader(user1Id));

      expect(response.status).toBe(200);
      expect(response.body.ok).toBe(true);
      expect(response.body.message).toContain('deleted successfully');
    });

    it('returns 403 FORBIDDEN when deleting another user reminder', async () => {
      const existingRow = {
        reminder_id: 'rem-101',
        user_id: user2Id,
      };

      db.query.mockResolvedValueOnce({ rows: [existingRow] });

      const response = await request(app)
        .delete('/api/reminders/rem-101')
        .set('Authorization', authHeader(user1Id));

      expect(response.status).toBe(403);
      expect(response.body.error.code).toBe('FORBIDDEN');
    });
  });

  describe('TC-Notif-02: Reminder notification timing, late protection, and duplicate prevention', () => {
    it('dispatches notification strictly before due date and prevents duplicates', async () => {
      const mockClient = {
        query: jest.fn(),
        release: jest.fn(),
      };
      const mockPool = {
        connect: jest.fn().mockResolvedValue(mockClient),
      };

      const mockNotificationService = {
        send: jest.fn().mockResolvedValue({ notificationId: 'notif-tc-01', delivered: true }),
      };

      const dueReminderRow = {
        reminder_id: 'rem-tc-02',
        user_id: user1Id,
        bill_name: 'Annual Insurance',
        amount: '12000.00',
        due_date: '2026-11-05',
        reminder_lead_days: 2, // Notification target: 2026-11-03
        status: 'active',
        last_notified_at: null,
        last_notified_due_date: null,
      };

      // 1. First run: today is 2026-11-03 (due_date - 2 days <= 2026-11-03, strictly before 2026-11-05)
      mockClient.query
        .mockResolvedValueOnce({ rows: [] }) // BEGIN
        .mockResolvedValueOnce({ rows: [dueReminderRow] }) // SELECT FOR UPDATE
        .mockResolvedValueOnce({ rows: [] }) // check reminder_dispatch_log
        .mockResolvedValueOnce({ rows: [] }) // check notifications table
        .mockResolvedValueOnce({ rows: [] }) // insert reminder_dispatch_log
        .mockResolvedValueOnce({
          rows: [
            {
              ...dueReminderRow,
              last_notified_at: new Date('2026-11-03T08:00:00.000Z'),
              last_notified_due_date: '2026-11-05',
            },
          ],
        }) // UPDATE bill_reminders
        .mockResolvedValueOnce({ rows: [] }); // COMMIT

      const firstRunResult = await processDueReminders({
        asOfDate: '2026-11-03',
        dbPool: mockPool,
        notificationService: mockNotificationService,
      });

      expect(firstRunResult.processedCount).toBe(1);
      expect(firstRunResult.successfulCount).toBe(1);
      expect(mockNotificationService.send).toHaveBeenCalledTimes(1);
      expect(mockNotificationService.send).toHaveBeenCalledWith({
        userId: user1Id,
        type: 'BILL_REMINDER',
        message: expect.stringMatching(/Annual Insurance.*12000\.00.*2026-11-05/),
      });

      // 2. Second run on same date: query finds 0 due rows because last_notified_due_date = due_date
      mockClient.query
        .mockResolvedValueOnce({ rows: [] }) // BEGIN
        .mockResolvedValueOnce({ rows: [] }) // SELECT finds 0 rows
        .mockResolvedValueOnce({ rows: [] }); // COMMIT

      const secondRunResult = await processDueReminders({
        asOfDate: '2026-11-03',
        dbPool: mockPool,
        notificationService: mockNotificationService,
      });

      expect(secondRunResult.processedCount).toBe(0);
      expect(secondRunResult.successfulCount).toBe(0);
      // No duplicate notification was dispatched
      expect(mockNotificationService.send).toHaveBeenCalledTimes(1);
    });

    it('regression test: duplicate delivery protection recovers from failure window without duplicate notification', async () => {
      const mockClient = {
        query: jest.fn(),
        release: jest.fn(),
      };
      const mockPool = {
        connect: jest.fn().mockResolvedValue(mockClient),
      };

      const mockNotificationService = {
        send: jest.fn(),
      };

      const reminderRow = {
        reminder_id: 'rem-recovery-01',
        user_id: user1Id,
        bill_name: 'Council Tax',
        amount: '180.00',
        due_date: '2026-11-10',
        reminder_lead_days: 3,
        status: 'active',
        last_notified_at: null,
        last_notified_due_date: null,
      };

      // Failure window simulation:
      // A previous scheduler run dispatched the notification, but crashed before bill_reminders was updated.
      // The recovery check discovers the existing notification in reminder_dispatch_log / notifications.
      mockClient.query
        .mockResolvedValueOnce({ rows: [] }) // BEGIN
        .mockResolvedValueOnce({ rows: [reminderRow] }) // SELECT FOR UPDATE
        .mockResolvedValueOnce({ rows: [{ notification_id: 'existing-notif-777' }] }) // found in reminder_dispatch_log!
        .mockResolvedValueOnce({
          rows: [
            {
              ...reminderRow,
              last_notified_at: new Date('2026-11-07T09:00:00.000Z'),
              last_notified_due_date: '2026-11-10',
            },
          ],
        }) // UPDATE bill_reminders
        .mockResolvedValueOnce({ rows: [] }) // INSERT reminder_dispatch_log ON CONFLICT
        .mockResolvedValueOnce({ rows: [] }); // COMMIT

      const result = await processDueReminders({
        asOfDate: '2026-11-07',
        dbPool: mockPool,
        notificationService: mockNotificationService,
      });

      expect(result.processedCount).toBe(1);
      expect(result.skippedDuplicateCount).toBe(1);
      expect(result.successfulCount).toBe(1);
      // Verifies notification was NOT resent
      expect(mockNotificationService.send).not.toHaveBeenCalled();
      expect(mockClient.query).toHaveBeenCalledWith('COMMIT');
    });

    it('late reminder protection: does not dispatch notification when server recovers on or after due date', async () => {
      const mockClient = {
        query: jest.fn(),
        release: jest.fn(),
      };
      const mockPool = {
        connect: jest.fn().mockResolvedValue(mockClient),
      };

      const mockNotificationService = {
        send: jest.fn(),
      };

      // Server was down until 2026-11-11; bill was due 2026-11-10
      mockClient.query
        .mockResolvedValueOnce({ rows: [] }) // BEGIN
        .mockResolvedValueOnce({ rows: [] }) // SELECT due_date > $1::DATE returns empty
        .mockResolvedValueOnce({ rows: [] }); // COMMIT

      const result = await processDueReminders({
        asOfDate: '2026-11-11',
        dbPool: mockPool,
        notificationService: mockNotificationService,
      });

      expect(result.processedCount).toBe(0);
      expect(mockNotificationService.send).not.toHaveBeenCalled();
    });
  });
});
