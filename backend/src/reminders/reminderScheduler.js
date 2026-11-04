const db = require('../db');
const NotificationService = require('../notifications/notificationService');
const { mapRowToReminder } = require('./remindersRepository');

const formatReminderMessage = (reminder) => {
  const amount = Number(reminder.amount).toFixed(2);
  const dueDate = reminder.dueDate;
  return `Reminder: Your bill "${reminder.billName}" for ₹${amount} is due on ${dueDate}.`;
};

const getTodayDateString = () => new Date().toISOString().slice(0, 10);

const schedulerState = {
  running: false,
  timer: null,
  intervalMs: 60000,
  lastRunAt: null,
  lastProcessedCount: 0,
};

/**
 * Deterministically process due reminders for a given reference date.
 * Enforces:
 * 1. Late reminder protection: only dispatches strictly before due date (due_date > asOfDate).
 * 2. Strict idempotency / duplicate delivery protection via reminder_dispatch_log and notification deduplication.
 * 3. Concurrency protection via row-level locking (FOR UPDATE SKIP LOCKED).
 */
async function processDueReminders({
  asOfDate = getTodayDateString(),
  dbPool = null,
  notificationService = NotificationService,
} = {}) {
  const pool = dbPool || db.getPool();
  const client = await pool.connect();

  const results = {
    asOfDate,
    processedCount: 0,
    successfulCount: 0,
    skippedDuplicateCount: 0,
    failedCount: 0,
    reminders: [],
    errors: [],
  };

  try {
    await client.query('BEGIN');

    // Late reminder protection: due_date > $1::DATE ensures we NEVER dispatch on or after due date.
    // Idempotency: (last_notified_due_date IS NULL OR last_notified_due_date != due_date) prevents duplicate sends.
    const selectQuery = `
      SELECT * FROM bill_reminders
      WHERE status = 'active'
        AND (due_date - (reminder_lead_days || ' days')::INTERVAL)::DATE <= $1::DATE
        AND due_date > $1::DATE
        AND (last_notified_due_date IS NULL OR last_notified_due_date != due_date)
      ORDER BY due_date ASC
      FOR UPDATE SKIP LOCKED;
    `;

    const queryResult = await client.query(selectQuery, [asOfDate]);
    const dueRows = queryResult.rows;
    results.processedCount = dueRows.length;

    for (const row of dueRows) {
      const reminder = mapRowToReminder(row);
      const message = formatReminderMessage(reminder);

      // Check persistent dispatch log to detect if notification was already delivered in a previous run
      // that encountered a failure before the reminder row update committed
      const logCheckQuery = `
        SELECT notification_id FROM reminder_dispatch_log
        WHERE reminder_id = $1 AND due_date = $2
        LIMIT 1;
      `;
      const logCheckResult = await client.query(logCheckQuery, [reminder.reminderId, reminder.dueDate]);

      // Check notifications table for identical notification for this user & message
      let existingNotificationId = logCheckResult.rows[0]?.notification_id;
      if (!existingNotificationId) {
        const notifCheckQuery = `
          SELECT notification_id FROM notifications
          WHERE user_id = $1 AND type = 'BILL_REMINDER' AND message = $2
          LIMIT 1;
        `;
        const notifCheckResult = await client.query(notifCheckQuery, [reminder.userId, message]);
        if (notifCheckResult.rows.length > 0) {
          existingNotificationId = notifCheckResult.rows[0].notification_id;
        }
      }

      if (existingNotificationId) {
        // Notification was already dispatched; synchronize reminder state without resending
        const syncQuery = `
          UPDATE bill_reminders
          SET last_notified_at = CURRENT_TIMESTAMP,
              last_notified_due_date = $2,
              updated_at = CURRENT_TIMESTAMP
          WHERE reminder_id = $1
          RETURNING *;
        `;
        await client.query(syncQuery, [reminder.reminderId, reminder.dueDate]);

        // Ensure dispatch log is recorded
        await client.query(
          `INSERT INTO reminder_dispatch_log (reminder_id, due_date, notification_id)
           VALUES ($1, $2, $3)
           ON CONFLICT (reminder_id, due_date) DO NOTHING;`,
          [reminder.reminderId, reminder.dueDate, existingNotificationId]
        );

        results.skippedDuplicateCount += 1;
        results.successfulCount += 1;
        results.reminders.push(reminder);
        continue;
      }

      // Not yet dispatched: perform delivery
      try {
        const sentRecord = await notificationService.send({
          userId: reminder.userId,
          type: 'BILL_REMINDER',
          message,
        });

        const notificationId = sentRecord?.notificationId || null;

        // Persist to dispatch log
        await client.query(
          `INSERT INTO reminder_dispatch_log (reminder_id, due_date, notification_id)
           VALUES ($1, $2, $3)
           ON CONFLICT (reminder_id, due_date) DO NOTHING;`,
          [reminder.reminderId, reminder.dueDate, notificationId]
        );

        // Mark as notified in the same transaction
        const updateQuery = `
          UPDATE bill_reminders
          SET last_notified_at = CURRENT_TIMESTAMP,
              last_notified_due_date = $2,
              updated_at = CURRENT_TIMESTAMP
          WHERE reminder_id = $1
          RETURNING *;
        `;
        const updatedResult = await client.query(updateQuery, [reminder.reminderId, reminder.dueDate]);
        const updatedReminder = mapRowToReminder(updatedResult.rows[0]);

        results.successfulCount += 1;
        results.reminders.push(updatedReminder);
      } catch (sendError) {
        // Notification delivery failed; do not update last_notified_at/due_date so it can be retried safely
        results.failedCount += 1;
        results.errors.push({
          reminderId: reminder.reminderId,
          userId: reminder.userId,
          error: sendError.message,
        });
        console.error(
          `[ReminderScheduler] Failed to dispatch reminder for reminder_id=${reminder.reminderId}:`,
          sendError.message
        );
      }
    }

    await client.query('COMMIT');
  } catch (txError) {
    try {
      await client.query('ROLLBACK');
    } catch (rollbackErr) {
      console.error('[ReminderScheduler] Rollback failed:', rollbackErr.message);
    }
    console.error('[ReminderScheduler] Transaction failed during due reminder processing:', txError.message);
    throw txError;
  } finally {
    client.release();
    schedulerState.lastRunAt = new Date().toISOString();
    schedulerState.lastProcessedCount = results.successfulCount;
  }

  return results;
}

/**
 * Starts the automatic reminder background scheduler.
 * Safe against duplicate calls (prevents multiple timer instances).
 */
function startReminderScheduler({
  intervalMs = 60000,
  notificationService = NotificationService,
  dbPool = null,
  runImmediate = true,
} = {}) {
  if (schedulerState.running) {
    return { ...schedulerState };
  }

  schedulerState.running = true;
  schedulerState.intervalMs = intervalMs;

  if (runImmediate) {
    processDueReminders({ dbPool, notificationService }).catch((err) => {
      console.error('[ReminderScheduler] Initial processing run error:', err.message);
    });
  }

  schedulerState.timer = setInterval(() => {
    processDueReminders({ dbPool, notificationService }).catch((err) => {
      console.error('[ReminderScheduler] Periodic processing run error:', err.message);
    });
  }, intervalMs);

  if (schedulerState.timer.unref) {
    schedulerState.timer.unref();
  }

  return { ...schedulerState };
}

/**
 * Stops the background scheduler and cleans up timer.
 */
function stopReminderScheduler() {
  if (schedulerState.timer) {
    clearInterval(schedulerState.timer);
    schedulerState.timer = null;
  }
  schedulerState.running = false;
  return { ...schedulerState };
}

/**
 * Returns current scheduler status.
 */
function getSchedulerStatus() {
  return { ...schedulerState };
}

module.exports = {
  formatReminderMessage,
  processDueReminders,
  startReminderScheduler,
  stopReminderScheduler,
  getSchedulerStatus,
};
