const request = require('supertest');
const app = require('../../src/app');
const config = require('../../src/config');
const { signTestToken } = require('../../src/auth/jwt');
const NotificationService = require('../../src/notifications/notificationService');
const MockNotificationProvider = require('../../src/notifications/providers/MockNotificationProvider');

const TEST_SECRET = 'test-secret-for-notification-integration-tests-only';
const originalJwtSecret = config.jwtSecret;
const authHeader = (userId, role = 'user') => `Bearer ${signTestToken(userId, role)}`;

beforeAll(() => {
  config.jwtSecret = TEST_SECRET;
});

afterAll(() => {
  config.jwtSecret = originalJwtSecret;
});

describe('Notifications Endpoints (Integration)', () => {
  let mockProvider;
  let mockRepository;
  let originalProvider;
  let originalRepository;

  beforeEach(() => {
    mockProvider = new MockNotificationProvider();
    mockRepository = {
      create: jest.fn().mockImplementation(async ({ userId, type, message, sentAt }) => ({
        notificationId: `notif-int-${Date.now()}`,
        userId,
        type,
        message,
        sentAt: sentAt instanceof Date ? sentAt.toISOString() : new Date().toISOString(),
      })),
      findByUserId: jest.fn().mockImplementation(async (userId, { limit, offset }) => [
        {
          notificationId: 'notif-1',
          userId,
          type: 'BUDGET_THRESHOLD',
          message: 'Budget reached 80%',
          sentAt: new Date().toISOString(),
        },
      ]),
      countByUserId: jest.fn().mockResolvedValue(1),
    };

    originalProvider = NotificationService.defaultInstance.provider;
    originalRepository = NotificationService.defaultInstance.repository;

    NotificationService.defaultInstance.provider = mockProvider;
    NotificationService.defaultInstance.repository = mockRepository;
  });

  afterEach(() => {
    NotificationService.defaultInstance.provider = originalProvider;
    NotificationService.defaultInstance.repository = originalRepository;
  });

  describe('POST /api/notifications', () => {
    it('dispatches notification for the authenticated user and persists record with HTTP 201', async () => {
      const payload = {
        userId: 'usr-int-1',
        type: 'BUDGET_THRESHOLD',
        message: 'You have used 85% of your Monthly Dining budget.',
      };

      const res = await request(app)
        .post('/api/notifications')
        .set('Authorization', authHeader('usr-int-1'))
        .send(payload);

      expect(res.status).toBe(201);
      expect(res.body).toHaveProperty('ok', true);
      expect(res.body).toHaveProperty('notification');
      expect(res.body.notification).toMatchObject({
        userId: 'usr-int-1',
        type: 'BUDGET_THRESHOLD',
        message: 'You have used 85% of your Monthly Dining budget.',
        delivered: true,
        provider: 'mock',
      });
      expect(res.body.notification).toHaveProperty('notificationId');
      expect(res.body.notification).toHaveProperty('sentAt');

      expect(mockRepository.create).toHaveBeenCalledTimes(1);
    });

    it('rejects requests without an authenticated session', async () => {
      const res = await request(app)
        .post('/api/notifications')
        .send({
          userId: 'usr-int-1',
          type: 'LIMIT_EXCEEDED',
          message: 'Budget limit exceeded!',
        });

      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe('MISSING_AUTHORIZATION');
    });

    it('returns 403 FORBIDDEN when an authenticated user tries to send notification for another user', async () => {
      const res = await request(app)
        .post('/api/notifications')
        .set('Authorization', authHeader('usr-int-1'))
        .send({
          userId: 'other-user',
          type: 'LIMIT_EXCEEDED',
          message: 'Budget limit exceeded!',
        });

      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('FORBIDDEN');
      expect(mockRepository.create).not.toHaveBeenCalled();
    });

    it('returns 400 VALIDATION_ERROR when required fields are missing', async () => {
      const res = await request(app)
        .post('/api/notifications')
        .set('Authorization', authHeader('usr-int-1'))
        .send({ userId: 'usr-int-1' });

      expect(res.status).toBe(400);
      expect(res.body).toHaveProperty('error');
      expect(res.body.error).toHaveProperty('code', 'VALIDATION_ERROR');
      expect(res.body.error.message).toContain('type is required');
    });

    it('returns 502 PROVIDER_ERROR when notification provider delivery fails', async () => {
      mockProvider.setShouldFail(true, 'Mock gateway connection timed out');

      const res = await request(app)
        .post('/api/notifications')
        .set('Authorization', authHeader('usr-int-1'))
        .send({
          userId: 'usr-int-1',
          type: 'LIMIT_EXCEEDED',
          message: 'Budget limit exceeded!',
        });

      expect(res.status).toBe(502);
      expect(res.body).toHaveProperty('error');
      expect(res.body.error).toHaveProperty('code', 'PROVIDER_ERROR');
      expect(res.body.error.message).toContain('Mock gateway connection timed out');
      expect(mockRepository.create).not.toHaveBeenCalled();
    });
  });

  describe('GET /api/notifications', () => {
    it('returns in-app notification list for the authenticated user with HTTP 200', async () => {
      const res = await request(app)
        .get('/api/notifications')
        .set('Authorization', authHeader('usr-int-1'))
        .query({ limit: 10, offset: 0 });

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('ok', true);
      expect(res.body).toHaveProperty('notifications');
      expect(Array.isArray(res.body.notifications)).toBe(true);
      expect(res.body.notifications).toHaveLength(1);
      expect(res.body.notifications[0]).toMatchObject({
        notificationId: 'notif-1',
        userId: 'usr-int-1',
        type: 'BUDGET_THRESHOLD',
      });
      expect(res.body).toHaveProperty('total', 1);
      expect(res.body).toHaveProperty('limit', 10);
      expect(res.body).toHaveProperty('offset', 0);
    });

    it('returns in-app notification list via /user/:userId route with HTTP 200 for the same authenticated user', async () => {
      const res = await request(app)
        .get('/api/notifications/user/usr-int-1')
        .set('Authorization', authHeader('usr-int-1'))
        .query({ limit: 10, offset: 0 });

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('ok', true);
      expect(res.body).toHaveProperty('notifications');
      expect(res.body.notifications).toHaveLength(1);
    });

    it('returns 403 FORBIDDEN when an authenticated user requests another user\'s notifications', async () => {
      const res = await request(app)
        .get('/api/notifications/user/other-user')
        .set('Authorization', authHeader('usr-int-1'))
        .query({ limit: 10, offset: 0 });

      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('FORBIDDEN');
    });

    it('returns 401 when no auth token is provided', async () => {
      const res = await request(app).get('/api/notifications');

      expect(res.status).toBe(401);
      expect(res.body).toHaveProperty('error');
      expect(res.body.error.code).toBe('MISSING_AUTHORIZATION');
    });
  });
});
