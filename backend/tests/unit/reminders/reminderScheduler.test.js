const {
  formatReminderMessage,
  processDueReminders,
  startReminderScheduler,
  stopReminderScheduler,
  getSchedulerStatus,
} = require('../../../src/reminders/reminderScheduler');

describe('ReminderScheduler (Unit — SEBM-F-051, TC-Notif-02)', () => {
  afterEach(() => {
    stopReminderScheduler();
    jest.clearAllMocks();
  });

  describe('formatReminderMessage', () => {
    it('formats a clear message with bill name, amount, and due date', () => {
      const reminder = {
        billName: 'Broadband',
        amount: '899.00',
        dueDate: '2026-11-05',
      };

      const message = formatReminderMessage(reminder);
      expect(message).toBe('Reminder: Your bill "Broadband" for ₹899.00 is due on 2026-11-05.');
    });
  });

  describe('processDueReminders', () => {
    let mockClient;
    let mockPool;
    let mockNotificationService;

    beforeEach(() => {
      mockClient = {
        query: jest.fn(),
        release: jest.fn(),
      };
      mockPool = {
        connect: jest.fn().mockResolvedValue(mockClient),
      };
      mockNotificationService = {
        send: jest.fn().mockResolvedValue({ notificationId: 'notif-generated-01', delivered: true }),
      };
    });

    it('queries due active reminders strictly before due date and dispatches notifications', async () => {
      const mockRows = [
        {
          reminder_id: 'rem-1',
          user_id: 'usr-1',
          bill_name: 'Electricity',
          amount: '1250.00',
          due_date: '2026-11-03',
          reminder_lead_days: 2,
          status: 'active',
          last_notified_at: null,
          last_notified_due_date: null,
          created_at: new Date(),
          updated_at: new Date(),
        },
      ];

      mockClient.query
        .mockResolvedValueOnce({ rows: [] }) // BEGIN
        .mockResolvedValueOnce({ rows: mockRows }) // SELECT FOR UPDATE
        .mockResolvedValueOnce({ rows: [] }) // SELECT from reminder_dispatch_log (not found)
        .mockResolvedValueOnce({ rows: [] }) // SELECT from notifications (not found)
        .mockResolvedValueOnce({ rows: [] }) // INSERT INTO reminder_dispatch_log
        .mockResolvedValueOnce({
          rows: [
            {
              ...mockRows[0],
              last_notified_at: new Date(),
              last_notified_due_date: '2026-11-03',
            },
          ],
        }) // UPDATE bill_reminders
        .mockResolvedValueOnce({ rows: [] }); // COMMIT

      const result = await processDueReminders({
        asOfDate: '2026-11-01',
        dbPool: mockPool,
        notificationService: mockNotificationService,
      });

      expect(result.processedCount).toBe(1);
      expect(result.successfulCount).toBe(1);
      expect(result.failedCount).toBe(0);

      // Verify BEGIN, SELECT, UPDATE, COMMIT were called
      expect(mockClient.query).toHaveBeenCalledWith('BEGIN');
      expect(mockClient.query).toHaveBeenCalledWith(
        expect.stringContaining('due_date > $1::DATE'),
        ['2026-11-01']
      );
      expect(mockNotificationService.send).toHaveBeenCalledWith({
        userId: 'usr-1',
        type: 'BILL_REMINDER',
        message: expect.stringContaining('Electricity'),
      });
      expect(mockClient.query).toHaveBeenCalledWith('COMMIT');
      expect(mockClient.release).toHaveBeenCalled();
    });

    it('late reminder protection: query excludes reminders when asOfDate is on or past due date', async () => {
      mockClient.query
        .mockResolvedValueOnce({ rows: [] }) // BEGIN
        .mockResolvedValueOnce({ rows: [] }) // SELECT with due_date > $1::DATE returns 0 rows
        .mockResolvedValueOnce({ rows: [] }); // COMMIT

      // If today is 2026-11-04 and bill was due 2026-11-03 (past due), no notification is dispatched
      const result = await processDueReminders({
        asOfDate: '2026-11-04',
        dbPool: mockPool,
        notificationService: mockNotificationService,
      });

      expect(result.processedCount).toBe(0);
      expect(result.successfulCount).toBe(0);
      expect(mockNotificationService.send).not.toHaveBeenCalled();
    });

    it('duplicate delivery protection: detects previously persisted notification and synchronizes state without resending', async () => {
      const mockRows = [
        {
          reminder_id: 'rem-idempotent-1',
          user_id: 'usr-1',
          bill_name: 'Water Bill',
          amount: '400.00',
          due_date: '2026-11-05',
          reminder_lead_days: 2,
          status: 'active',
          last_notified_at: null,
          last_notified_due_date: null,
        },
      ];

      // Simulate failure window recovery:
      // The previous run called NotificationService.send() and created a notification,
      // but crashed before the reminder table was updated.
      mockClient.query
        .mockResolvedValueOnce({ rows: [] }) // BEGIN
        .mockResolvedValueOnce({ rows: mockRows }) // SELECT FOR UPDATE
        .mockResolvedValueOnce({ rows: [{ notification_id: 'existing-notif-999' }] }) // Found in reminder_dispatch_log!
        .mockResolvedValueOnce({ rows: [{ ...mockRows[0], last_notified_at: new Date() }] }) // UPDATE bill_reminders sync
        .mockResolvedValueOnce({ rows: [] }) // INSERT INTO reminder_dispatch_log ON CONFLICT DO NOTHING
        .mockResolvedValueOnce({ rows: [] }); // COMMIT

      const result = await processDueReminders({
        asOfDate: '2026-11-03',
        dbPool: mockPool,
        notificationService: mockNotificationService,
      });

      expect(result.processedCount).toBe(1);
      expect(result.skippedDuplicateCount).toBe(1);
      expect(result.successfulCount).toBe(1);
      // Crucial: notificationService.send MUST NOT have been called again!
      expect(mockNotificationService.send).not.toHaveBeenCalled();
      expect(mockClient.query).toHaveBeenCalledWith('COMMIT');
    });

    it('handles provider delivery failure gracefully without updating state to allow safe retry', async () => {
      const mockRows = [
        {
          reminder_id: 'rem-fail',
          user_id: 'usr-2',
          bill_name: 'Water Utility',
          amount: '400.00',
          due_date: '2026-11-02',
          reminder_lead_days: 1,
          status: 'active',
          last_notified_at: null,
          last_notified_due_date: null,
          created_at: new Date(),
          updated_at: new Date(),
        },
      ];

      mockClient.query
        .mockResolvedValueOnce({ rows: [] }) // BEGIN
        .mockResolvedValueOnce({ rows: mockRows }) // SELECT
        .mockResolvedValueOnce({ rows: [] }) // reminder_dispatch_log not found
        .mockResolvedValueOnce({ rows: [] }) // notifications not found
        .mockResolvedValueOnce({ rows: [] }); // COMMIT

      mockNotificationService.send.mockRejectedValueOnce(new Error('Network gateway timeout'));

      const result = await processDueReminders({
        asOfDate: '2026-11-01',
        dbPool: mockPool,
        notificationService: mockNotificationService,
      });

      expect(result.processedCount).toBe(1);
      expect(result.successfulCount).toBe(0);
      expect(result.failedCount).toBe(1);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].error).toBe('Network gateway timeout');

      // Verify UPDATE was NOT called for this failed reminder
      const updateCalls = mockClient.query.mock.calls.filter((call) =>
        call[0].includes('UPDATE bill_reminders')
      );
      expect(updateCalls).toHaveLength(0);

      expect(mockClient.query).toHaveBeenCalledWith('COMMIT');
      expect(mockClient.release).toHaveBeenCalled();
    });

    it('rolls back transaction on query failure', async () => {
      mockClient.query
        .mockResolvedValueOnce({ rows: [] }) // BEGIN
        .mockRejectedValueOnce(new Error('Database lock deadlock')); // SELECT failure

      await expect(
        processDueReminders({
          asOfDate: '2026-11-01',
          dbPool: mockPool,
          notificationService: mockNotificationService,
        })
      ).rejects.toThrow('Database lock deadlock');

      expect(mockClient.query).toHaveBeenCalledWith('ROLLBACK');
      expect(mockClient.release).toHaveBeenCalled();
    });
  });

  describe('startReminderScheduler & stopReminderScheduler', () => {
    it('starts the scheduler and prevents multiple running instances', () => {
      const mockService = { send: jest.fn().mockResolvedValue({}) };

      const status1 = startReminderScheduler({
        intervalMs: 30000,
        notificationService: mockService,
        runImmediate: false,
      });
      expect(status1.running).toBe(true);

      const status2 = startReminderScheduler({
        intervalMs: 30000,
        notificationService: mockService,
        runImmediate: false,
      });
      expect(status2.running).toBe(true);

      const currentStatus = getSchedulerStatus();
      expect(currentStatus.running).toBe(true);
      expect(currentStatus.intervalMs).toBe(30000);

      const stoppedStatus = stopReminderScheduler();
      expect(stoppedStatus.running).toBe(false);
      expect(getSchedulerStatus().running).toBe(false);
    });
  });
});
