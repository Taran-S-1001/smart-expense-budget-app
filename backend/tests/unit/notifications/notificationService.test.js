const NotificationService = require('../../../src/notifications/notificationService');
const MockNotificationProvider = require('../../../src/notifications/providers/MockNotificationProvider');

describe('NotificationService (Unit)', () => {
  let mockProvider;
  let mockRepository;
  let service;

  beforeEach(() => {
    mockProvider = new MockNotificationProvider();
    mockRepository = {
      create: jest.fn().mockImplementation(async ({ userId, type, message, sentAt }) => ({
        notificationId: 'notif-uuid-1',
        userId,
        type,
        message,
        sentAt: sentAt.toISOString ? sentAt.toISOString() : new Date().toISOString(),
      })),
      findByUserId: jest.fn().mockResolvedValue([
        {
          notificationId: 'notif-uuid-1',
          userId: 'user-1',
          type: 'BUDGET_THRESHOLD',
          message: 'Budget warning',
          sentAt: new Date().toISOString(),
        },
      ]),
      countByUserId: jest.fn().mockResolvedValue(1),
    };

    service = new NotificationService({
      provider: mockProvider,
      repository: mockRepository,
    });
  });

  describe('input validation', () => {
    it('rejects invalid or empty userId', async () => {
      await expect(service.send({ userId: '', type: 'ALERT', message: 'Hello' })).rejects.toMatchObject({
        code: 'VALIDATION_ERROR',
        statusCode: 400,
      });

      await expect(service.send({ userId: null, type: 'ALERT', message: 'Hello' })).rejects.toMatchObject({
        code: 'VALIDATION_ERROR',
        statusCode: 400,
      });

      await expect(service.send({ userId: '   ', type: 'ALERT', message: 'Hello' })).rejects.toMatchObject({
        code: 'VALIDATION_ERROR',
        statusCode: 400,
      });
    });

    it('rejects invalid or empty type', async () => {
      await expect(service.send({ userId: 'u1', type: '', message: 'Hello' })).rejects.toMatchObject({
        code: 'VALIDATION_ERROR',
        statusCode: 400,
      });

      await expect(service.send({ userId: 'u1', type: '   ', message: 'Hello' })).rejects.toMatchObject({
        code: 'VALIDATION_ERROR',
        statusCode: 400,
      });

      // Exceeding 50 characters (DB constraint)
      const longType = 'A'.repeat(51);
      await expect(service.send({ userId: 'u1', type: longType, message: 'Hello' })).rejects.toMatchObject({
        code: 'VALIDATION_ERROR',
        statusCode: 400,
      });
    });

    it('rejects invalid or empty message', async () => {
      await expect(service.send({ userId: 'u1', type: 'ALERT', message: '' })).rejects.toMatchObject({
        code: 'VALIDATION_ERROR',
        statusCode: 400,
      });

      await expect(service.send({ userId: 'u1', type: 'ALERT', message: '   ' })).rejects.toMatchObject({
        code: 'VALIDATION_ERROR',
        statusCode: 400,
      });
    });
  });

  describe('public contract: send({ userId, type, message })', () => {
    it('dispatches notification via provider and persists to repository', async () => {
      const result = await service.send({
        userId: 'user-456',
        type: 'BUDGET_THRESHOLD',
        message: '80% budget limit reached for Groceries.',
      });

      expect(result).toHaveProperty('notificationId', 'notif-uuid-1');
      expect(result).toHaveProperty('userId', 'user-456');
      expect(result).toHaveProperty('type', 'BUDGET_THRESHOLD');
      expect(result).toHaveProperty('message', '80% budget limit reached for Groceries.');
      expect(result).toHaveProperty('delivered', true);
      expect(result).toHaveProperty('provider', 'mock');
      expect(result).toHaveProperty('sentAt');

      expect(mockRepository.create).toHaveBeenCalledTimes(1);
      expect(mockRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: 'user-456',
          type: 'BUDGET_THRESHOLD',
          message: '80% budget limit reached for Groceries.',
        })
      );
    });

    it('supports static contract: NotificationService.send({ userId, type, message })', async () => {
      // Temporarily mock defaultInstance repository and provider
      const originalRepo = NotificationService.defaultInstance.repository;
      const originalProvider = NotificationService.defaultInstance.provider;

      NotificationService.defaultInstance.repository = mockRepository;
      NotificationService.defaultInstance.provider = mockProvider;

      try {
        const result = await NotificationService.send({
          userId: 'user-789',
          type: 'LIMIT_EXCEEDED',
          message: '100% budget exceeded for Entertainment.',
        });

        expect(result).toHaveProperty('notificationId', 'notif-uuid-1');
        expect(result.userId).toBe('user-789');
        expect(result.delivered).toBe(true);
      } finally {
        NotificationService.defaultInstance.repository = originalRepo;
        NotificationService.defaultInstance.provider = originalProvider;
      }
    });
  });

  describe('error handling & failures', () => {
    it('fails with PROVIDER_ERROR when provider fails, without persisting or reporting delivery', async () => {
      mockProvider.setShouldFail(true, 'FCM service unavailable');

      await expect(
        service.send({
          userId: 'user-1',
          type: 'BUDGET_THRESHOLD',
          message: 'Test message',
        })
      ).rejects.toMatchObject({
        code: 'PROVIDER_ERROR',
        statusCode: 502,
        message: expect.stringContaining('FCM service unavailable'),
      });

      // Repository must NOT have been called to persist a false successful delivery
      expect(mockRepository.create).not.toHaveBeenCalled();
    });

    it('fails with DATABASE_ERROR when repository persistence fails', async () => {
      mockRepository.create.mockRejectedValueOnce(new Error('Connection terminated unexpectedly'));

      await expect(
        service.send({
          userId: 'user-1',
          type: 'BUDGET_THRESHOLD',
          message: 'Test message',
        })
      ).rejects.toMatchObject({
        code: 'DATABASE_ERROR',
        statusCode: 500,
        message: expect.stringContaining('Connection terminated unexpectedly'),
      });
    });
  });

  describe('listNotifications', () => {
    it('validates userId is provided', async () => {
      await expect(service.listNotifications('')).rejects.toMatchObject({
        code: 'VALIDATION_ERROR',
        statusCode: 400,
      });
    });

    it('fetches notifications with sanitized pagination options', async () => {
      const result = await service.listNotifications('user-1', { limit: 10, offset: 5 });

      expect(mockRepository.findByUserId).toHaveBeenCalledWith('user-1', { limit: 10, offset: 5 });
      expect(mockRepository.countByUserId).toHaveBeenCalledWith('user-1');
      expect(result).toMatchObject({
        notifications: expect.any(Array),
        total: 1,
        limit: 10,
        offset: 5,
      });
    });
  });
});
