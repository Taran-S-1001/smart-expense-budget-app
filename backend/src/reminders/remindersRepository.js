const db = require('../db');

/**
 * Maps database snake_case row to camelCase reminder domain object.
 */
const mapRowToReminder = (row) => {
  if (!row) return null;
  return {
    reminderId: row.reminder_id,
    userId: row.user_id,
    billName: row.bill_name,
    amount: parseFloat(row.amount).toFixed(2),
    dueDate: row.due_date instanceof Date
      ? row.due_date.toISOString().slice(0, 10)
      : String(row.due_date).slice(0, 10),
    reminderLeadDays: parseInt(row.reminder_lead_days, 10),
    status: row.status,
    lastNotifiedAt: row.last_notified_at instanceof Date
      ? row.last_notified_at.toISOString()
      : (row.last_notified_at || null),
    lastNotifiedDueDate: row.last_notified_due_date instanceof Date
      ? row.last_notified_due_date.toISOString().slice(0, 10)
      : (row.last_notified_due_date || null),
    createdAt: row.created_at instanceof Date
      ? row.created_at.toISOString()
      : row.created_at,
    updatedAt: row.updated_at instanceof Date
      ? row.updated_at.toISOString()
      : row.updated_at,
  };
};

class RemindersRepository {
  constructor(dbClient = db) {
    this.db = dbClient;
  }

  /**
   * Create a new bill reminder.
   */
  async createReminder({ userId, billName, amount, dueDate, reminderLeadDays = 1 }) {
    const query = `
      INSERT INTO bill_reminders (user_id, bill_name, amount, due_date, reminder_lead_days, status)
      VALUES ($1, $2, $3, $4, $5, 'active')
      RETURNING *;
    `;
    const values = [userId, billName, amount, dueDate, reminderLeadDays];
    const result = await this.db.query(query, values);
    return mapRowToReminder(result.rows[0]);
  }

  /**
   * Find all reminders belonging to a user, optionally filtered by status.
   */
  async findRemindersByUserId(userId, { status } = {}) {
    let query = `
      SELECT * FROM bill_reminders
      WHERE user_id = $1
    `;
    const values = [userId];

    if (status && status !== 'all') {
      values.push(status);
      query += ` AND status = $${values.length}`;
    }

    query += ' ORDER BY due_date ASC, created_at ASC;';

    const result = await this.db.query(query, values);
    return result.rows.map(mapRowToReminder);
  }

  /**
   * Find a single reminder by reminderId.
   */
  async findById(reminderId) {
    const query = 'SELECT * FROM bill_reminders WHERE reminder_id = $1 LIMIT 1;';
    const result = await this.db.query(query, [reminderId]);
    if (result.rows.length === 0) {
      return null;
    }
    return mapRowToReminder(result.rows[0]);
  }

  /**
   * Update an existing reminder.
   * If dueDate or reminderLeadDays changes, notification state is reset
   * to ensure advance reminders can be sent for the revised due date.
   */
  async updateReminder(reminderId, updates = {}) {
    const fields = [];
    const values = [];
    let paramIndex = 1;

    if (updates.billName !== undefined) {
      fields.push(`bill_name = $${paramIndex++}`);
      values.push(updates.billName);
    }
    if (updates.amount !== undefined) {
      fields.push(`amount = $${paramIndex++}`);
      values.push(updates.amount);
    }
    if (updates.dueDate !== undefined) {
      fields.push(`due_date = $${paramIndex++}`);
      values.push(updates.dueDate);
      // Reset notification tracking when due date is modified
      fields.push('last_notified_at = NULL');
      fields.push('last_notified_due_date = NULL');
    }
    if (updates.reminderLeadDays !== undefined) {
      fields.push(`reminder_lead_days = $${paramIndex++}`);
      values.push(updates.reminderLeadDays);
      // Reset notification tracking when lead days are modified
      fields.push('last_notified_at = NULL');
      fields.push('last_notified_due_date = NULL');
    }
    if (updates.status !== undefined) {
      fields.push(`status = $${paramIndex++}`);
      values.push(updates.status);
    }
    if (updates.lastNotifiedAt !== undefined) {
      fields.push(`last_notified_at = $${paramIndex++}`);
      values.push(updates.lastNotifiedAt);
    }
    if (updates.lastNotifiedDueDate !== undefined) {
      fields.push(`last_notified_due_date = $${paramIndex++}`);
      values.push(updates.lastNotifiedDueDate);
    }

    if (fields.length === 0) {
      return this.findById(reminderId);
    }

    fields.push('updated_at = CURRENT_TIMESTAMP');
    values.push(reminderId);

    const query = `
      UPDATE bill_reminders
      SET ${fields.join(', ')}
      WHERE reminder_id = $${paramIndex}
      RETURNING *;
    `;

    const result = await this.db.query(query, values);
    if (result.rows.length === 0) {
      return null;
    }
    return mapRowToReminder(result.rows[0]);
  }

  /**
   * Delete a reminder by reminderId.
   */
  async deleteReminder(reminderId) {
    const query = 'DELETE FROM bill_reminders WHERE reminder_id = $1 RETURNING reminder_id;';
    const result = await this.db.query(query, [reminderId]);
    return result.rows.length > 0;
  }

  /**
   * Check if a notification for (reminderId, dueDate) has already been dispatched.
   */
  async isAlreadyDispatched(reminderId, dueDate, client = this.db) {
    const query = `
      SELECT 1 FROM reminder_dispatch_log
      WHERE reminder_id = $1 AND due_date = $2
      LIMIT 1;
    `;
    const result = await client.query(query, [reminderId, dueDate]);
    return result.rows.length > 0;
  }

  /**
   * Record dispatch in persistent log.
   */
  async recordDispatch(reminderId, dueDate, notificationId, client = this.db) {
    const query = `
      INSERT INTO reminder_dispatch_log (reminder_id, due_date, notification_id)
      VALUES ($1, $2, $3)
      ON CONFLICT (reminder_id, due_date) DO NOTHING
      RETURNING *;
    `;
    const result = await client.query(query, [reminderId, dueDate, notificationId]);
    return result.rows[0] || null;
  }

  /**
   * Mark reminder as notified with timestamp and due date occurrence.
   */
  async markNotified(reminderId, dueDate, notifiedAt = new Date(), client = this.db) {
    const query = `
      UPDATE bill_reminders
      SET last_notified_at = $2, last_notified_due_date = $3, updated_at = CURRENT_TIMESTAMP
      WHERE reminder_id = $1
      RETURNING *;
    `;
    const result = await client.query(query, [reminderId, notifiedAt, dueDate]);
    return mapRowToReminder(result.rows[0]);
  }

  /**
   * Select active reminders that are due for notification before the due date.
   * Enforces:
   * 1. Status is 'active' (paid and cancelled are excluded).
   * 2. Target notification date (due_date - reminder_lead_days) <= asOfDate.
   * 3. Late reminder protection: due_date > asOfDate (must be strictly before due date).
   * 4. Idempotency: not yet notified for this specific due_date.
   */
  async findDueReminders(asOfDate, client = this.db, useLocking = false) {
    const lockClause = useLocking ? ' FOR UPDATE SKIP LOCKED' : '';
    const query = `
      SELECT * FROM bill_reminders
      WHERE status = 'active'
        AND (due_date - (reminder_lead_days || ' days')::INTERVAL)::DATE <= $1::DATE
        AND due_date > $1::DATE
        AND (last_notified_due_date IS NULL OR last_notified_due_date != due_date)
      ORDER BY due_date ASC
      ${lockClause};
    `;
    const result = await client.query(query, [asOfDate]);
    return result.rows.map(mapRowToReminder);
  }
}

module.exports = RemindersRepository;
module.exports.mapRowToReminder = mapRowToReminder;
