const db = require('../db');

/**
 * Maps database snake_case row to camelCase notification domain object.
 */
const mapRowToNotification = (row) => {
  if (!row) return null;
  return {
    notificationId: row.notification_id,
    userId: row.user_id,
    type: row.type,
    message: row.message,
    sentAt: row.sent_at instanceof Date ? row.sent_at.toISOString() : row.sent_at,
  };
};

/**
 * NotificationRepository
 * Interacts with PostgreSQL notifications table using parameterized SQL queries.
 */
class NotificationRepository {
  constructor(dbClient = db) {
    this.db = dbClient;
  }

  /**
   * Persist a new notification record.
   * @param {Object} params
   * @param {string} params.userId
   * @param {string} params.type
   * @param {string} params.message
   * @param {Date|string} [params.sentAt]
   * @returns {Promise<Object>}
   */
  async create({ userId, type, message, sentAt = new Date() }) {
    const text = `
      INSERT INTO notifications (user_id, type, message, sent_at)
      VALUES ($1, $2, $3, $4)
      RETURNING notification_id, user_id, type, message, sent_at
    `;
    const values = [userId, type, message, sentAt];
    const result = await this.db.query(text, values);
    return mapRowToNotification(result.rows[0]);
  }

  /**
   * Find notifications for a specific user ordered by sent_at DESC.
   * @param {string} userId
   * @param {Object} [options]
   * @param {number} [options.limit=50]
   * @param {number} [options.offset=0]
   * @returns {Promise<Array<Object>>}
   */
  async findByUserId(userId, { limit = 50, offset = 0 } = {}) {
    const text = `
      SELECT notification_id, user_id, type, message, sent_at
      FROM notifications
      WHERE user_id = $1
      ORDER BY sent_at DESC
      LIMIT $2 OFFSET $3
    `;
    const values = [userId, limit, offset];
    const result = await this.db.query(text, values);
    return result.rows.map(mapRowToNotification);
  }

  /**
   * Count total notifications for a user.
   * @param {string} userId
   * @returns {Promise<number>}
   */
  async countByUserId(userId) {
    const text = `
      SELECT COUNT(*)::int AS total
      FROM notifications
      WHERE user_id = $1
    `;
    const result = await this.db.query(text, [userId]);
    return result.rows[0] ? parseInt(result.rows[0].total, 10) : 0;
  }

  /**
   * Find a notification by its ID.
   * @param {string} notificationId
   * @returns {Promise<Object|null>}
   */
  async findById(notificationId) {
    const text = `
      SELECT notification_id, user_id, type, message, sent_at
      FROM notifications
      WHERE notification_id = $1
    `;
    const result = await this.db.query(text, [notificationId]);
    return mapRowToNotification(result.rows[0]);
  }
}

const defaultRepository = new NotificationRepository();

module.exports = defaultRepository;
module.exports.NotificationRepository = NotificationRepository;
module.exports.mapRowToNotification = mapRowToNotification;
