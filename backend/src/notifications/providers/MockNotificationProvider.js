const NotificationProvider = require('./NotificationProvider');

/**
 * MockNotificationProvider
 * Implements NotificationProvider for local development, automated testing,
 * and demonstration without external credentials (per DEV-04 in docs/DEVIATIONS.md).
 * In-memory delivery tracking and configurable failure simulation.
 */
class MockNotificationProvider extends NotificationProvider {
  constructor(options = {}) {
    super(options.name || 'mock');
    this.sentNotifications = [];
    this.shouldFail = options.shouldFail || false;
    this.failureMessage = options.failureMessage || 'Simulated provider delivery failure';
  }

  /**
   * Configure simulated delivery failure for testing.
   * @param {boolean} shouldFail
   * @param {string} [failureMessage]
   */
  setShouldFail(shouldFail, failureMessage) {
    this.shouldFail = Boolean(shouldFail);
    if (failureMessage) {
      this.failureMessage = failureMessage;
    }
  }

  /**
   * Send notification via mock provider.
   * Records notification in memory and returns delivery receipt.
   * @param {Object} params
   * @param {string} params.userId
   * @param {string} params.type
   * @param {string} params.message
   * @returns {Promise<{delivered: boolean, provider: string, sentAt: string}>}
   */
  async send({ userId, type, message }) {
    if (this.shouldFail) {
      throw new Error(this.failureMessage);
    }

    const deliveryRecord = {
      userId,
      type,
      message,
      sentAt: new Date().toISOString(),
      provider: this.name,
    };

    this.sentNotifications.push(deliveryRecord);

    return {
      delivered: true,
      provider: this.name,
      sentAt: deliveryRecord.sentAt,
    };
  }

  /**
   * Retrieve all notifications delivered through this mock instance.
   * @returns {Array<Object>}
   */
  getSentNotifications() {
    return [...this.sentNotifications];
  }

  /**
   * Clear recorded notifications.
   */
  clear() {
    this.sentNotifications = [];
  }
}

module.exports = MockNotificationProvider;
