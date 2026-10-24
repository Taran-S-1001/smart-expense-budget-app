const NotificationProvider = require('../../../src/notifications/providers/NotificationProvider');
const MockNotificationProvider = require('../../../src/notifications/providers/MockNotificationProvider');

describe('Notification Providers (Unit)', () => {
  describe('NotificationProvider (Base)', () => {
    it('defines base interface and throws if send() is not implemented', async () => {
      const provider = new NotificationProvider('test');
      expect(provider.name).toBe('test');

      await expect(
        provider.send({ userId: 'u1', type: 'BUDGET_THRESHOLD', message: 'Hello' })
      ).rejects.toThrow(/must be implemented by subclass/);
    });
  });

  describe('MockNotificationProvider', () => {
    let mockProvider;

    beforeEach(() => {
      mockProvider = new MockNotificationProvider();
    });

    it('successfully delivers notification and returns delivery receipt', async () => {
      const result = await mockProvider.send({
        userId: 'user-123',
        type: 'BUDGET_THRESHOLD',
        message: 'You have reached 80% of your Dining budget.',
      });

      expect(result).toHaveProperty('delivered', true);
      expect(result).toHaveProperty('provider', 'mock');
      expect(result).toHaveProperty('sentAt');

      const sent = mockProvider.getSentNotifications();
      expect(sent).toHaveLength(1);
      expect(sent[0]).toMatchObject({
        userId: 'user-123',
        type: 'BUDGET_THRESHOLD',
        message: 'You have reached 80% of your Dining budget.',
        provider: 'mock',
      });
    });

    it('clears recorded notifications on clear()', async () => {
      await mockProvider.send({ userId: 'u1', type: 'ALERT', message: 'Test 1' });
      expect(mockProvider.getSentNotifications()).toHaveLength(1);

      mockProvider.clear();
      expect(mockProvider.getSentNotifications()).toHaveLength(0);
    });

    it('simulates provider failure when configured with setShouldFail(true)', async () => {
      mockProvider.setShouldFail(true, 'SendGrid quota exceeded');

      await expect(
        mockProvider.send({ userId: 'u1', type: 'ALERT', message: 'Failing message' })
      ).rejects.toThrow('SendGrid quota exceeded');

      expect(mockProvider.getSentNotifications()).toHaveLength(0);
    });
  });
});
