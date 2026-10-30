const AccountRepository = require('./accountRepository');

const createError = (code, message, statusCode) => {
  const error = new Error(message);
  error.code = code;
  error.statusCode = statusCode;
  return error;
};

const parseOpeningBalance = (value) => {
  if (value === undefined) return 0;
  if (typeof value !== 'number' && typeof value !== 'string') return NaN;
  if (typeof value === 'string' && value.trim() === '') return NaN;
  return Number(value);
};

const hasAtMostTwoDecimalPlaces = (value) =>
  /^-?\d+(?:\.\d{1,2})?$/.test(String(value).trim());

class AccountService {
  constructor(repository = new AccountRepository()) {
    this.repository = repository;
  }

  async listAccounts(userId) {
    return this.repository.findByUserId(userId);
  }

  async createAccount(userId, data = {}) {
    const accountType = typeof data.accountType === 'string' ? data.accountType.trim() : '';
    const accountName = typeof data.accountName === 'string' ? data.accountName.trim() : '';
    const openingBalance = parseOpeningBalance(data.openingBalance);

    if (!accountType || accountType.length > 50) {
      throw createError('VALIDATION_ERROR', 'accountType is required and must not exceed 50 characters.', 400);
    }
    if (!accountName || accountName.length > 100) {
      throw createError('VALIDATION_ERROR', 'accountName is required and must not exceed 100 characters.', 400);
    }
    if (!Number.isFinite(openingBalance) || Math.abs(openingBalance) > 9999999999.99) {
      throw createError('VALIDATION_ERROR', 'openingBalance must be a valid amount.', 400);
    }
    if (!hasAtMostTwoDecimalPlaces(data.openingBalance ?? 0)) {
      throw createError('VALIDATION_ERROR', 'openingBalance must have no more than two decimal places.', 400);
    }

    return this.repository.create({ userId, accountType, accountName, openingBalance });
  }

  async transfer(userId, data = {}) {
    const fromAccountId = typeof data.fromAccountId === 'string' ? data.fromAccountId.trim() : '';
    const toAccountId = typeof data.toAccountId === 'string' ? data.toAccountId.trim() : '';
    const amount = parseOpeningBalance(data.amount);

    if (!fromAccountId) {
      throw createError('VALIDATION_ERROR', 'fromAccountId is required.', 400);
    }
    if (!toAccountId) {
      throw createError('VALIDATION_ERROR', 'toAccountId is required.', 400);
    }
    if (fromAccountId === toAccountId) {
      throw createError('VALIDATION_ERROR', 'Source and destination accounts must be different.', 400);
    }
    if (data.amount === undefined || !Number.isFinite(amount) || amount <= 0 || amount > 9999999999.99) {
      throw createError('VALIDATION_ERROR', 'amount must be a valid positive amount.', 400);
    }
    if (!/^\d+(?:\.\d{1,2})?$/.test(String(data.amount).trim())) {
      throw createError('VALIDATION_ERROR', 'amount must have no more than two decimal places.', 400);
    }

    return this.repository.transfer({ userId, fromAccountId, toAccountId, amount });
  }
}


module.exports = AccountService;
module.exports.createError = createError;
module.exports.hasAtMostTwoDecimalPlaces = hasAtMostTwoDecimalPlaces;
module.exports.parseOpeningBalance = parseOpeningBalance;
