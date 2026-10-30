const TransactionRepository = require('./transactionRepository');
const { checkThreshold } = require('../budgets');

const createError = (code, message, statusCode) => {
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

const formatTransaction = (transaction) => ({
  transactionId: transaction.transactionId,
  accountId: transaction.accountId,
  categoryId: transaction.categoryId,
  amount: transaction.amount,
  type: transaction.type,
  date: transaction.date,
  notes: transaction.notes,
  createdAt: transaction.createdAt,
});

class TransactionService {
  constructor(repository = new TransactionRepository()) {
    this.repository = repository;
  }

  async listTransactions(userId) {
    return this.repository.findByUserId(userId);
  }

  async listCategories(userId) {
    return this.repository.findCategoriesByUserId(userId);
  }

  async createCategory(userId, data = {}) {
    const name = typeof data.name === 'string' ? data.name.trim() : '';
    const type = typeof data.type === 'string' ? data.type.trim().toLowerCase() : data.type;

    if (!name || name.length > 100) {
      throw createError('VALIDATION_ERROR', 'name is required and must not exceed 100 characters.', 400);
    }
    if (type !== 'expense' && type !== 'income') {
      throw createError('VALIDATION_ERROR', 'type must be either expense or income.', 400);
    }

    return this.repository.createCustomCategory({ userId, name, type });
  }

  validateTransactionInput(data = {}) {
    const { accountId, categoryId, date } = data;
    const amount = parseAmount(data.amount);
    const type = typeof data.type === 'string' ? data.type.toLowerCase() : data.type;

    if (typeof accountId !== 'string' || accountId.trim() === '') {
      throw createError('VALIDATION_ERROR', 'accountId is required.', 400);
    }
    if (typeof categoryId !== 'string' || categoryId.trim() === '') {
      throw createError('VALIDATION_ERROR', 'categoryId is required.', 400);
    }
    if (!Number.isFinite(amount) || amount <= 0 || amount > 9999999999.99) {
      throw createError('VALIDATION_ERROR', 'amount must be a valid positive amount.', 400);
    }
    if (!hasAtMostTwoDecimalPlaces(data.amount)) {
      throw createError('VALIDATION_ERROR', 'amount must have no more than two decimal places.', 400);
    }
    if (type !== 'expense' && type !== 'income') {
      throw createError('VALIDATION_ERROR', 'type must be either expense or income.', 400);
    }
    if (!isValidDate(date)) {
      throw createError('VALIDATION_ERROR', 'date must be a valid date in YYYY-MM-DD format.', 400);
    }
    if (data.notes !== undefined && data.notes !== null && typeof data.notes !== 'string') {
      throw createError('VALIDATION_ERROR', 'notes must be a string.', 400);
    }

    return {
      accountId: accountId.trim(),
      categoryId: categoryId.trim(),
      amount,
      type,
      date,
      notes: data.notes?.trim() || null,
    };
  }

  async createTransaction(userId, data = {}) {
    const { accountId, categoryId, amount, type, date, notes } = this.validateTransactionInput(data);
    const { transaction, newBalance } = await this.repository.createAndUpdateBalance({
      userId,
      accountId,
      categoryId,
      amount,
      type,
      date,
      notes,
    });

    // Trigger budget threshold evaluation for expense transactions (S2-08 / SEBM-F-022)
    if (transaction.type === 'expense') {
      try {
        await checkThreshold(userId, transaction.categoryId, transaction.date);
      } catch (err) {
        console.error('Error executing budget checkThreshold:', err);
      }
    }

    return {
      transactionId: transaction.transactionId,
      accountId: transaction.accountId,
      categoryId: transaction.categoryId,
      amount: transaction.amount,
      type: transaction.type,
      date: transaction.date,
      notes: transaction.notes,
      newBalance,
      createdAt: transaction.createdAt,
    };
  }

  async updateTransaction(userId, transactionId, data = {}) {
    const id = this.validateTransactionId(transactionId);
    const input = this.validateTransactionInput(data);
    const result = await this.repository.updateAndAdjustBalance({ userId, transactionId: id, ...input });

    // Keep budget warnings current for the old and the new category/date (S2-08 contract).
    await this.refreshThresholds(userId, [result.previous, result.transaction]);

    return {
      ...formatTransaction(result.transaction),
      newBalance: result.newBalance,
      ...(result.previous.accountId !== result.transaction.accountId
        ? { previousAccountId: result.previous.accountId, previousAccountBalance: result.previousAccountBalance }
        : {}),
    };
  }

  async deleteTransaction(userId, transactionId) {
    const id = this.validateTransactionId(transactionId);
    const { transaction, newBalance } = await this.repository.deleteAndReverseBalance({
      userId,
      transactionId: id,
    });

    await this.refreshThresholds(userId, [transaction]);

    return { transactionId: transaction.transactionId, accountId: transaction.accountId, newBalance };
  }

  validateTransactionId(transactionId) {
    if (typeof transactionId !== 'string' || transactionId.trim() === '' || transactionId.length > 64) {
      throw createError('VALIDATION_ERROR', 'transactionId is invalid.', 400);
    }
    return transactionId.trim();
  }

  async refreshThresholds(userId, transactions) {
    const seen = new Set();
    for (const item of transactions) {
      if (item.type !== 'expense') continue;
      const key = `${item.categoryId}|${item.date}`;
      if (seen.has(key)) continue;
      seen.add(key);
      try {
        await checkThreshold(userId, item.categoryId, item.date);
      } catch (err) {
        console.error('Error executing budget checkThreshold:', err);
      }
    }
  }
}

module.exports = TransactionService;
module.exports.createError = createError;
module.exports.hasAtMostTwoDecimalPlaces = hasAtMostTwoDecimalPlaces;
module.exports.isValidDate = isValidDate;
module.exports.parseAmount = parseAmount;
