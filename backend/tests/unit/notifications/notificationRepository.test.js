const { NotificationRepository, mapRowToNotification } = require('../../../src/notifications/notificationRepository');

describe('NotificationRepository (Unit / Parameterized SQL)', () => {
  let mockDb;
  let repo;

  beforeEach(() => {
    mockDb = {
      query: jest.fn(),
    };
    repo = new NotificationRepository(mockDb);
  });

  describe('mapRowToNotification', () => {
    it('returns null when row is undefined or null', () => {
      expect(mapRowToNotification(null)).toBeNull();
      expect(mapRowToNotification(undefined)).toBeNull();
    });

    it('correctly maps snake_case database columns to camelCase domain model', () => {
      const now = new Date();
      const row = {
        notification_id: 'uuid-1',
        user_id: 'user-1',
        type: 'BUDGET_THRESHOLD',
        message: '80% reached',
        sent_at: now,
      };

      const mapped = mapRowToNotification(row);
      expect(mapped).toEqual({
        notificationId: 'uuid-1',
        userId: 'user-1',
        type: 'BUDGET_THRESHOLD',
        message: '80% reached',
        sentAt: now.toISOString(),
      });
    });
  });

  describe('create', () => {
    it('uses parameterized INSERT query to prevent SQL injection', async () => {
      const sentAt = new Date('2026-10-24T12:00:00Z');
      mockDb.query.mockResolvedValueOnce({
        rows: [
          {
            notification_id: 'gen-uuid-1',
            user_id: 'usr-1',
            type: 'BUDGET_THRESHOLD',
            message: 'Alert msg',
            sent_at: sentAt,
          },
        ],
      });

      const result = await repo.create({
        userId: 'usr-1',
        type: 'BUDGET_THRESHOLD',
        message: 'Alert msg',
        sentAt,
      });

      expect(mockDb.query).toHaveBeenCalledTimes(1);
      const [sql, params] = mockDb.query.mock.calls[0];

      // Verifies SQL parameterization per requirement 5
      expect(sql).toContain('INSERT INTO notifications');
      expect(sql).toContain('VALUES ($1, $2, $3, $4)');
      expect(params).toEqual(['usr-1', 'BUDGET_THRESHOLD', 'Alert msg', sentAt]);
      expect(result.notificationId).toBe('gen-uuid-1');
    });
  });

  describe('findByUserId', () => {
    it('uses parameterized SELECT query with ORDER BY sent_at DESC and pagination', async () => {
      mockDb.query.mockResolvedValueOnce({
        rows: [
          {
            notification_id: 'n1',
            user_id: 'u1',
            type: 'BUDGET_THRESHOLD',
            message: 'msg',
            sent_at: new Date('2026-10-24T12:00:00Z'),
          },
        ],
      });

      const result = await repo.findByUserId('u1', { limit: 20, offset: 10 });

      expect(mockDb.query).toHaveBeenCalledTimes(1);
      const [sql, params] = mockDb.query.mock.calls[0];

      expect(sql).toContain('WHERE user_id = $1');
      expect(sql).toContain('ORDER BY sent_at DESC');
      expect(sql).toContain('LIMIT $2 OFFSET $3');
      expect(params).toEqual(['u1', 20, 10]);
      expect(result).toHaveLength(1);
    });
  });

  describe('countByUserId', () => {
    it('executes parameterized COUNT query and parses integer result', async () => {
      mockDb.query.mockResolvedValueOnce({
        rows: [{ total: '42' }],
      });

      const count = await repo.countByUserId('u1');

      expect(mockDb.query).toHaveBeenCalledTimes(1);
      const [sql, params] = mockDb.query.mock.calls[0];

      expect(sql).toContain('SELECT COUNT(*)::int AS total');
      expect(sql).toContain('FROM notifications');
      expect(sql).toContain('WHERE user_id = $1');
      expect(params).toEqual(['u1']);
      expect(count).toBe(42);
    });
  });

  describe('findById', () => {
    it('executes parameterized SELECT query by notification_id', async () => {
      mockDb.query.mockResolvedValueOnce({
        rows: [
          {
            notification_id: 'n1',
            user_id: 'u1',
            type: 'BUDGET_THRESHOLD',
            message: 'msg',
            sent_at: new Date('2026-10-24T12:00:00Z'),
          },
        ],
      });

      const result = await repo.findById('n1');

      expect(mockDb.query).toHaveBeenCalledTimes(1);
      const [sql, params] = mockDb.query.mock.calls[0];

      expect(sql).toContain('WHERE notification_id = $1');
      expect(params).toEqual(['n1']);
      expect(result.notificationId).toBe('n1');
    });
  });
});
