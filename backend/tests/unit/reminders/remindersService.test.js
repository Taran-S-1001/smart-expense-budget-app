const RemindersService = require('../../../src/reminders/remindersService');

describe('RemindersService (Unit — SEBM-F-051, TC-Notif-02)', () => {
  let mockRepository;
  let service;

  beforeEach(() => {
    mockRepository = {
      createReminder: jest.fn(),
      findRemindersByUserId: jest.fn(),
      findById: jest.fn(),
      updateReminder: jest.fn(),
      deleteReminder: jest.fn(),
    };
    service = new RemindersService(mockRepository);
  });

  describe('validateCreatePayload', () => {
    it('accepts a valid reminder creation payload', () => {
      const valid = {
        billName: 'Internet Fiber',
        amount: 999.50,
        dueDate: '2026-11-15',
        reminderLeadDays: 2,
      };

      const result = service.validateCreatePayload(valid);
      expect(result).toEqual({
        billName: 'Internet Fiber',
        amount: '999.50',
        dueDate: '2026-11-15',
        reminderLeadDays: 2,
      });
    });

    it('defaults reminderLeadDays to 1 if not provided', () => {
      const result = service.validateCreatePayload({
        billName: 'Electricity',
        amount: 500,
        dueDate: '2026-11-10',
      });
      expect(result.reminderLeadDays).toBe(1);
    });

    it('throws VALIDATION_ERROR (400) when billName is missing or empty', () => {
      expect(() =>
        service.validateCreatePayload({
          billName: '',
          amount: 100,
          dueDate: '2026-11-10',
        })
      ).toThrow('Bill name is required.');

      expect(() =>
        service.validateCreatePayload({
          billName: '   ',
          amount: 100,
          dueDate: '2026-11-10',
        })
      ).toThrow('Bill name is required.');
    });

    it('throws VALIDATION_ERROR (400) when billName exceeds 100 characters', () => {
      expect(() =>
        service.validateCreatePayload({
          billName: 'A'.repeat(101),
          amount: 100,
          dueDate: '2026-11-10',
        })
      ).toThrow('Bill name must not exceed 100 characters.');
    });

    it('throws VALIDATION_ERROR (400) for non-positive or invalid amounts', () => {
      expect(() =>
        service.validateCreatePayload({
          billName: 'Rent',
          amount: 0,
          dueDate: '2026-11-10',
        })
      ).toThrow(/Amount must be a positive number/);

      expect(() =>
        service.validateCreatePayload({
          billName: 'Rent',
          amount: -50,
          dueDate: '2026-11-10',
        })
      ).toThrow(/Amount must be a positive number/);

      expect(() =>
        service.validateCreatePayload({
          billName: 'Rent',
          amount: 'abc',
          dueDate: '2026-11-10',
        })
      ).toThrow(/Amount must be a positive number/);

      expect(() =>
        service.validateCreatePayload({
          billName: 'Rent',
          amount: 10.999,
          dueDate: '2026-11-10',
        })
      ).toThrow(/Amount must be a positive number/);
    });

    it('throws VALIDATION_ERROR (400) for invalid dueDate format or invalid calendar date', () => {
      expect(() =>
        service.validateCreatePayload({
          billName: 'Rent',
          amount: 1000,
          dueDate: 'invalid-date',
        })
      ).toThrow(/Due date must be a valid date in YYYY-MM-DD format/);

      expect(() =>
        service.validateCreatePayload({
          billName: 'Rent',
          amount: 1000,
          dueDate: '2026-02-31',
        })
      ).toThrow(/Due date must be a valid date in YYYY-MM-DD format/);
    });

    it('throws VALIDATION_ERROR (400) for invalid reminderLeadDays (must be integer 1 to 30 per AC-SEBM-F-051)', () => {
      // 0 is rejected: SEBM-F-051 explicitly mandates notification BEFORE the due date
      expect(() =>
        service.validateCreatePayload({
          billName: 'Rent',
          amount: 1000,
          dueDate: '2026-11-10',
          reminderLeadDays: 0,
        })
      ).toThrow(/Reminder lead days must be an integer between 1 and 30/);

      expect(() =>
        service.validateCreatePayload({
          billName: 'Rent',
          amount: 1000,
          dueDate: '2026-11-10',
          reminderLeadDays: -1,
        })
      ).toThrow(/Reminder lead days must be an integer between 1 and 30/);

      expect(() =>
        service.validateCreatePayload({
          billName: 'Rent',
          amount: 1000,
          dueDate: '2026-11-10',
          reminderLeadDays: 31,
        })
      ).toThrow(/Reminder lead days must be an integer between 1 and 30/);

      expect(() =>
        service.validateCreatePayload({
          billName: 'Rent',
          amount: 1000,
          dueDate: '2026-11-10',
          reminderLeadDays: 2.5,
        })
      ).toThrow(/Reminder lead days must be an integer between 1 and 30/);
    });
  });

  describe('validateUpdatePayload', () => {
    it('accepts valid partial update fields', () => {
      const updates = service.validateUpdatePayload({
        billName: 'Updated Bill',
        amount: 150.75,
        status: 'PAID',
        reminderLeadDays: 3,
      });

      expect(updates).toEqual({
        billName: 'Updated Bill',
        amount: '150.75',
        status: 'paid',
        reminderLeadDays: 3,
      });
    });

    it('throws VALIDATION_ERROR (400) when reminderLeadDays is 0 in update', () => {
      expect(() =>
        service.validateUpdatePayload({ reminderLeadDays: 0 })
      ).toThrow(/Reminder lead days must be an integer between 1 and 30/);
    });

    it('throws VALIDATION_ERROR (400) when status is not valid', () => {
      expect(() =>
        service.validateUpdatePayload({ status: 'unknown' })
      ).toThrow('Status must be one of: active, paid, cancelled.');
    });

    it('throws VALIDATION_ERROR (400) when no valid update fields are provided', () => {
      expect(() => service.validateUpdatePayload({})).toThrow(
        'At least one field to update must be provided.'
      );
    });
  });

  describe('createReminder', () => {
    it('throws UNAUTHORIZED (401) when userId is missing', async () => {
      await expect(service.createReminder(null, {})).rejects.toThrow(
        'User authentication required.'
      );
    });

    it('validates and calls repository.createReminder', async () => {
      const createdRecord = {
        reminderId: 'rem-1',
        userId: 'user-1',
        billName: 'Gas Utility',
        amount: '350.00',
        dueDate: '2026-11-20',
        reminderLeadDays: 3,
        status: 'active',
      };
      mockRepository.createReminder.mockResolvedValueOnce(createdRecord);

      const result = await service.createReminder('user-1', {
        billName: 'Gas Utility',
        amount: 350,
        dueDate: '2026-11-20',
        reminderLeadDays: 3,
      });

      expect(result).toEqual(createdRecord);
      expect(mockRepository.createReminder).toHaveBeenCalledWith({
        userId: 'user-1',
        billName: 'Gas Utility',
        amount: '350.00',
        dueDate: '2026-11-20',
        reminderLeadDays: 3,
      });
    });
  });

  describe('listReminders', () => {
    it('throws UNAUTHORIZED (401) when userId is missing', async () => {
      await expect(service.listReminders('')).rejects.toThrow(
        'User authentication required.'
      );
    });

    it('calls repository.findRemindersByUserId', async () => {
      const mockList = [{ reminderId: 'rem-1', billName: 'Rent' }];
      mockRepository.findRemindersByUserId.mockResolvedValueOnce(mockList);

      const result = await service.listReminders('user-1', { status: 'active' });
      expect(result).toEqual(mockList);
      expect(mockRepository.findRemindersByUserId).toHaveBeenCalledWith('user-1', {
        status: 'active',
      });
    });
  });

  describe('getReminder', () => {
    it('returns reminder when reminder exists and belongs to requesting user', async () => {
      const mockReminder = { reminderId: 'rem-1', userId: 'user-1', billName: 'Rent' };
      mockRepository.findById.mockResolvedValueOnce(mockReminder);

      const result = await service.getReminder('user-1', 'rem-1');
      expect(result).toEqual(mockReminder);
    });

    it('throws REMINDER_NOT_FOUND (404) when reminder does not exist', async () => {
      mockRepository.findById.mockResolvedValueOnce(null);

      await expect(service.getReminder('user-1', 'rem-nonexistent')).rejects.toThrow(
        'Reminder not found.'
      );
    });

    it('throws FORBIDDEN (403) when reminder belongs to another user', async () => {
      const mockReminder = { reminderId: 'rem-1', userId: 'user-other', billName: 'Rent' };
      mockRepository.findById.mockResolvedValueOnce(mockReminder);

      await expect(service.getReminder('user-1', 'rem-1')).rejects.toThrow(
        'Access denied: reminder belongs to another user.'
      );
    });
  });

  describe('updateReminder', () => {
    it('successfully updates reminder when user is owner', async () => {
      const existing = { reminderId: 'rem-1', userId: 'user-1', billName: 'Rent' };
      const updated = { ...existing, status: 'paid' };

      mockRepository.findById.mockResolvedValueOnce(existing);
      mockRepository.updateReminder.mockResolvedValueOnce(updated);

      const result = await service.updateReminder('user-1', 'rem-1', { status: 'paid' });
      expect(result).toEqual(updated);
      expect(mockRepository.updateReminder).toHaveBeenCalledWith('rem-1', { status: 'paid' });
    });

    it('resets notification state when dueDate is modified', async () => {
      const existing = {
        reminderId: 'rem-1',
        userId: 'user-1',
        billName: 'Rent',
        dueDate: '2026-11-05',
        lastNotifiedAt: '2026-11-03T10:00:00.000Z',
      };
      const updated = {
        ...existing,
        dueDate: '2026-12-05',
        lastNotifiedAt: null,
      };

      mockRepository.findById.mockResolvedValueOnce(existing);
      mockRepository.updateReminder.mockResolvedValueOnce(updated);

      const result = await service.updateReminder('user-1', 'rem-1', { dueDate: '2026-12-05' });
      expect(result).toEqual(updated);
      expect(mockRepository.updateReminder).toHaveBeenCalledWith('rem-1', { dueDate: '2026-12-05' });
    });

    it('throws FORBIDDEN (403) when updating another user reminder', async () => {
      const existing = { reminderId: 'rem-1', userId: 'user-other', billName: 'Rent' };
      mockRepository.findById.mockResolvedValueOnce(existing);

      await expect(
        service.updateReminder('user-1', 'rem-1', { status: 'paid' })
      ).rejects.toThrow('Access denied: reminder belongs to another user.');
      expect(mockRepository.updateReminder).not.toHaveBeenCalled();
    });
  });

  describe('deleteReminder', () => {
    it('successfully deletes reminder when user is owner', async () => {
      const existing = { reminderId: 'rem-1', userId: 'user-1', billName: 'Rent' };
      mockRepository.findById.mockResolvedValueOnce(existing);
      mockRepository.deleteReminder.mockResolvedValueOnce(true);

      const result = await service.deleteReminder('user-1', 'rem-1');
      expect(result).toBe(true);
      expect(mockRepository.deleteReminder).toHaveBeenCalledWith('rem-1');
    });

    it('throws FORBIDDEN (403) when deleting another user reminder', async () => {
      const existing = { reminderId: 'rem-1', userId: 'user-other', billName: 'Rent' };
      mockRepository.findById.mockResolvedValueOnce(existing);

      await expect(service.deleteReminder('user-1', 'rem-1')).rejects.toThrow(
        'Access denied: reminder belongs to another user.'
      );
      expect(mockRepository.deleteReminder).not.toHaveBeenCalled();
    });
  });
});
