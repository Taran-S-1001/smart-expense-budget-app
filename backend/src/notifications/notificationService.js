const defaultRepository = require('./notificationRepository');
const MockNotificationProvider = require('./providers/MockNotificationProvider');

/**
 * NotificationService
 * Provides notification dispatching, provider abstraction, input validation,
 * and persistence per SRS SEBM-F-050 and SAD Section 3.4/3.5.
 */
class NotificationService {
  constructor({ provider = new MockNotificationProvider(), repository = defaultRepository } = {}) {
    this.provider = provider;
    this.repository = repository;
  }

  /**
   * Public contract: NotificationService.send({ userId, type, message })
   * Dispatches notification via configured provider and persists record to PostgreSQL.
   *
   * @param {Object} params
   * @param {string} params.userId - Recipient user ID
   * @param {string} params.type - Notification type (e.g. BUDGET_THRESHOLD, LIMIT_EXCEEDED, BILL_REMINDER)
   * @param {string} params.message - Notification message content
   * @returns {Promise<Object>} Created and delivered notification record
   */
  async send({ userId, type, message }) {
    // 1. Input validation
    if (!userId || typeof userId !== 'string' || userId.trim() === '') {
      const err = new Error('userId is required and must be a non-empty string');
      err.code = 'VALIDATION_ERROR';
      err.statusCode = 400;
      throw err;
    }

    if (!type || typeof type !== 'string' || type.trim() === '') {
      const err = new Error('type is required and must be a non-empty string');
      err.code = 'VALIDATION_ERROR';
      err.statusCode = 400;
      throw err;
    }

    const trimmedType = type.trim();
    if (trimmedType.length > 50) {
      const err = new Error('type must not exceed 50 characters');
      err.code = 'VALIDATION_ERROR';
      err.statusCode = 400;
      throw err;
    }

    if (!message || typeof message !== 'string' || message.trim() === '') {
      const err = new Error('message is required and must be a non-empty string');
      err.code = 'VALIDATION_ERROR';
      err.statusCode = 400;
      throw err;
    }

    const trimmedUserId = userId.trim();
    const trimmedMessage = message.trim();

    // 2. Dispatch via provider (Do not silently report success if provider fails)
    let providerResult;
    try {
      providerResult = await this.provider.send({
        userId: trimmedUserId,
        type: trimmedType,
        message: trimmedMessage,
      });
    } catch (providerErr) {
      const err = new Error(`Notification delivery failed: ${providerErr.message}`);
      err.code = 'PROVIDER_ERROR';
      err.statusCode = 502;
      err.cause = providerErr;
      throw err;
    }

    // 3. Persist notification record to database
    let record;
    try {
      record = await this.repository.create({
        userId: trimmedUserId,
        type: trimmedType,
        message: trimmedMessage,
        sentAt: providerResult.sentAt ? new Date(providerResult.sentAt) : new Date(),
      });
    } catch (dbErr) {
      const err = new Error(`Notification persistence failed: ${dbErr.message}`);
      err.code = 'DATABASE_ERROR';
      err.statusCode = 500;
      err.cause = dbErr;
      throw err;
    }

    return {
      notificationId: record.notificationId,
      userId: record.userId,
      type: record.type,
      message: record.message,
      sentAt: record.sentAt,
      delivered: true,
      provider: providerResult.provider || this.provider.name,
    };
  }

  /**
   * In-app notification list: fetches notifications for a user ordered by sent_at DESC.
   *
   * @param {string} userId
   * @param {Object} [options]
   * @param {number} [options.limit=50]
   * @param {number} [options.offset=0]
   * @returns {Promise<{notifications: Array<Object>, total: number, limit: number, offset: number}>}
   */
  async listNotifications(userId, { limit = 50, offset = 0 } = {}) {
    if (!userId || typeof userId !== 'string' || userId.trim() === '') {
      const err = new Error('userId is required and must be a non-empty string');
      err.code = 'VALIDATION_ERROR';
      err.statusCode = 400;
      throw err;
    }

    const safeLimit = Math.min(Math.max(parseInt(limit, 10) || 50, 1), 100);
    const safeOffset = Math.max(parseInt(offset, 10) || 0, 0);

    const [notifications, total] = await Promise.all([
      this.repository.findByUserId(userId.trim(), { limit: safeLimit, offset: safeOffset }),
      this.repository.countByUserId(userId.trim()),
    ]);

    return {
      notifications,
      total,
      limit: safeLimit,
      offset: safeOffset,
    };
  }

  /**
   * Static delegation for class-level contract: NotificationService.send({ userId, type, message })
   */
  static async send(payload) {
    return defaultInstance.send(payload);
  }

  /**
   * Static delegation for class-level listing
   */
  static async listNotifications(userId, options) {
    return defaultInstance.listNotifications(userId, options);
  }
}

const defaultInstance = new NotificationService();

module.exports = NotificationService;
module.exports.defaultInstance = defaultInstance;
