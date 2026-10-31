const RemindersRepository = require('./remindersRepository');

const createError = (code, message, statusCode = 400) => {
  const error = new Error(message);
  error.code = code;
  error.statusCode = statusCode;
  return error;
};

const isValidDate = (value) => {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
};

const parseAmount = (value) => {
  if (typeof value !== 'number' && typeof value !== 'string') return NaN;
  if (typeof value === 'string' && value.trim() === '') return NaN;
  return Number(value);
};

const hasAtMostTwoDecimalPlaces = (value) =>
  /^\d+(?:\.\d{1,2})?$/.test(String(value).trim());

class RemindersService {
  constructor(repository = new RemindersRepository()) {
    this.repository = repository;
  }

  /**
   * Validate bill reminder creation payload.
   * reminderLeadDays must be between 1 and 30 per SEBM-F-051 ("before the due date").
   */
  validateCreatePayload({ billName, amount, dueDate, reminderLeadDays }) {
    if (!billName || typeof billName !== 'string' || !billName.trim()) {
      throw createError('VALIDATION_ERROR', 'Bill name is required.', 400);
    }
    const trimmedName = billName.trim();
    if (trimmedName.length > 100) {
      throw createError('VALIDATION_ERROR', 'Bill name must not exceed 100 characters.', 400);
    }

    const parsedAmount = parseAmount(amount);
    if (Number.isNaN(parsedAmount) || parsedAmount <= 0 || !hasAtMostTwoDecimalPlaces(amount)) {
      throw createError('VALIDATION_ERROR', 'Amount must be a positive number with up to two decimal places.', 400);
    }

    if (!isValidDate(dueDate)) {
      throw createError('VALIDATION_ERROR', 'Due date must be a valid date in YYYY-MM-DD format.', 400);
    }

    let leadDays = 1;
    if (reminderLeadDays !== undefined && reminderLeadDays !== null && reminderLeadDays !== '') {
      const parsedDays = Number(reminderLeadDays);
      if (!Number.isInteger(parsedDays) || parsedDays < 1 || parsedDays > 30) {
        throw createError('VALIDATION_ERROR', 'Reminder lead days must be an integer between 1 and 30.', 400);
      }
      leadDays = parsedDays;
    }

    return {
      billName: trimmedName,
      amount: parsedAmount.toFixed(2),
      dueDate,
      reminderLeadDays: leadDays,
    };
  }

  /**
   * Validate bill reminder update payload.
   */
  validateUpdatePayload({ billName, amount, dueDate, reminderLeadDays, status }) {
    const updates = {};

    if (billName !== undefined) {
      if (typeof billName !== 'string' || !billName.trim()) {
        throw createError('VALIDATION_ERROR', 'Bill name cannot be empty.', 400);
      }
      const trimmed = billName.trim();
      if (trimmed.length > 100) {
        throw createError('VALIDATION_ERROR', 'Bill name must not exceed 100 characters.', 400);
      }
      updates.billName = trimmed;
    }

    if (amount !== undefined) {
      const parsedAmount = parseAmount(amount);
      if (Number.isNaN(parsedAmount) || parsedAmount <= 0 || !hasAtMostTwoDecimalPlaces(amount)) {
        throw createError('VALIDATION_ERROR', 'Amount must be a positive number with up to two decimal places.', 400);
      }
      updates.amount = parsedAmount.toFixed(2);
    }

    if (dueDate !== undefined) {
      if (!isValidDate(dueDate)) {
        throw createError('VALIDATION_ERROR', 'Due date must be a valid date in YYYY-MM-DD format.', 400);
      }
      updates.dueDate = dueDate;
    }

    if (reminderLeadDays !== undefined) {
      const parsedDays = Number(reminderLeadDays);
      if (!Number.isInteger(parsedDays) || parsedDays < 1 || parsedDays > 30) {
        throw createError('VALIDATION_ERROR', 'Reminder lead days must be an integer between 1 and 30.', 400);
      }
      updates.reminderLeadDays = parsedDays;
    }

    if (status !== undefined) {
      const validStatuses = ['active', 'paid', 'cancelled'];
      if (typeof status !== 'string' || !validStatuses.includes(status.toLowerCase())) {
        throw createError('VALIDATION_ERROR', 'Status must be one of: active, paid, cancelled.', 400);
      }
      updates.status = status.toLowerCase();
    }

    if (Object.keys(updates).length === 0) {
      throw createError('VALIDATION_ERROR', 'At least one field to update must be provided.', 400);
    }

    return updates;
  }

  /**
   * Create a new reminder for user.
   */
  async createReminder(userId, payload) {
    if (!userId || typeof userId !== 'string' || !userId.trim()) {
      throw createError('UNAUTHORIZED', 'User authentication required.', 401);
    }

    const validated = this.validateCreatePayload(payload);
    return this.repository.createReminder({
      userId: userId.trim(),
      ...validated,
    });
  }

  /**
   * List reminders for a user.
   */
  async listReminders(userId, { status } = {}) {
    if (!userId || typeof userId !== 'string' || !userId.trim()) {
      throw createError('UNAUTHORIZED', 'User authentication required.', 401);
    }

    return this.repository.findRemindersByUserId(userId.trim(), { status });
  }

  /**
   * Get a single reminder by ID with user ownership check.
   */
  async getReminder(userId, reminderId) {
    if (!userId || typeof userId !== 'string' || !userId.trim()) {
      throw createError('UNAUTHORIZED', 'User authentication required.', 401);
    }
    if (!reminderId || typeof reminderId !== 'string' || !reminderId.trim()) {
      throw createError('VALIDATION_ERROR', 'Reminder ID is required.', 400);
    }

    const reminder = await this.repository.findById(reminderId.trim());
    if (!reminder) {
      throw createError('REMINDER_NOT_FOUND', 'Reminder not found.', 404);
    }

    if (reminder.userId !== userId.trim()) {
      throw createError('FORBIDDEN', 'Access denied: reminder belongs to another user.', 403);
    }

    return reminder;
  }

  /**
   * Update a reminder with user ownership check.
   */
  async updateReminder(userId, reminderId, payload) {
    const existing = await this.getReminder(userId, reminderId);
    const updates = this.validateUpdatePayload(payload);

    return this.repository.updateReminder(existing.reminderId, updates);
  }

  /**
   * Delete a reminder with user ownership check.
   */
  async deleteReminder(userId, reminderId) {
    const existing = await this.getReminder(userId, reminderId);
    return this.repository.deleteReminder(existing.reminderId);
  }
}

module.exports = RemindersService;
