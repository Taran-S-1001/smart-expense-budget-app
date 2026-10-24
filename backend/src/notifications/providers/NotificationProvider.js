/**
 * NotificationProvider base interface/contract.
 * Any notification provider (Mock, Push, Email, SMS) must implement the send() method.
 */
class NotificationProvider {
  constructor(name = 'base') {
    this.name = name;
  }

  /**
   * Send a notification through this provider.
   * @param {Object} params
   * @param {string} params.userId - Recipient user ID
   * @param {string} params.type - Notification type (e.g. BUDGET_THRESHOLD, BILL_REMINDER)
   * @param {string} params.message - Notification message content
   * @returns {Promise<{delivered: boolean, provider: string, sentAt: string}>}
   */
  async send({ userId, type, message }) {
    throw new Error('NotificationProvider.send() must be implemented by subclass');
  }
}

module.exports = NotificationProvider;
