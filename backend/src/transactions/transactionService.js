const accountRepository = require('../accounts/accountRepository');
const transactionRepository = require('./transactionRepository');

const normalizeType = (type) => {
  if (!type) {
    const error = new Error('Transaction type is required.');
    error.code = 'VALIDATION_ERROR';
    error.statusCode = 400;
    throw error;
  }

  const normalized = String(type).trim();
  if (normalized.toLowerCase() === 'expense') return 'Expense';
  if (normalized.toLowerCase() === 'income') return 'Income';

  const error = new Error('Transaction type must be either Expense or Income.');
  error.code = 'VALIDATION_ERROR';
  error.statusCode = 400;
  throw error;
};

class TransactionService {
  listTransactions() {
    return transactionRepository.list();
  }

  getTransactionById(transactionId) {
    const transaction = transactionRepository.findById(transactionId);
    if (!transaction) {
      const error = new Error('Transaction not found.');
      error.code = 'TRANSACTION_NOT_FOUND';
      error.statusCode = 404;
      throw error;
    }

    return transaction;
  }

  createTransaction(data) {
    const requiredFields = ['account_id', 'amount', 'date', 'type'];
    for (const field of requiredFields) {
      if (!data || data[field] === undefined || data[field] === null || data[field] === '') {
        const error = new Error(`Field "${field}" is required.`);
        error.code = 'VALIDATION_ERROR';
        error.statusCode = 400;
        throw error;
      }
    }

    const numericAmount = Number(data.amount);
    if (!Number.isFinite(numericAmount) || numericAmount <= 0) {
      const error = new Error('Transaction amount must be a valid number greater than zero.');
      error.code = 'VALIDATION_ERROR';
      error.statusCode = 400;
      throw error;
    }

    const account = accountRepository.findById(data.account_id);
    if (!account) {
      const error = new Error('Account not found.');
      error.code = 'ACCOUNT_NOT_FOUND';
      error.statusCode = 404;
      throw error;
    }

    const type = normalizeType(data.type);
    const delta = type === 'Expense' ? -numericAmount : numericAmount;
    if (type === 'Expense' && account.balance < numericAmount) {
      const error = new Error('Insufficient funds for transaction.');
      error.code = 'INSUFFICIENT_FUNDS';
      error.statusCode = 400;
      throw error;
    }

    account.balance = Number((account.balance + delta).toFixed(2));

    const transaction = transactionRepository.create({
      account_id: data.account_id,
      category_id: data.category_id,
      amount: numericAmount,
      date: data.date,
      type,
      notes: data.notes,
    });

    return transaction;
  }

  updateTransaction(transactionId, changes) {
    const transaction = this.getTransactionById(transactionId);
    const originalAmount = Number(transaction.amount);
    const originalType = transaction.type;
    const nextType = normalizeType(changes.type ?? originalType);
    const nextAmount = Number(changes.amount ?? originalAmount);

    if (!Number.isFinite(nextAmount) || nextAmount <= 0) {
      const error = new Error('Transaction amount must be a valid number greater than zero.');
      error.code = 'VALIDATION_ERROR';
      error.statusCode = 400;
      throw error;
    }

    const account = accountRepository.findById(changes.account_id ?? transaction.account_id);
    if (!account) {
      const error = new Error('Account not found.');
      error.code = 'ACCOUNT_NOT_FOUND';
      error.statusCode = 404;
      throw error;
    }

    const originalDelta = originalType === 'Expense' ? -originalAmount : originalAmount;
    const nextDelta = nextType === 'Expense' ? -nextAmount : nextAmount;
    const netBalanceChange = nextDelta - originalDelta;

    if (nextType === 'Expense' && account.balance + netBalanceChange < 0) {
      const error = new Error('Insufficient funds for transaction update.');
      error.code = 'INSUFFICIENT_FUNDS';
      error.statusCode = 400;
      throw error;
    }

    account.balance = Number((account.balance - originalDelta + nextDelta).toFixed(2));

    const updated = transactionRepository.update(transactionId, {
      ...changes,
      type: nextType,
      amount: nextAmount,
    });

    return updated;
  }

  deleteTransaction(transactionId) {
    const existing = this.getTransactionById(transactionId);
    const account = accountRepository.findById(existing.account_id);
    if (!account) {
      const error = new Error('Account not found.');
      error.code = 'ACCOUNT_NOT_FOUND';
      error.statusCode = 404;
      throw error;
    }

    const delta = existing.type === 'Expense' ? -existing.amount : existing.amount;
    account.balance = Number((account.balance - delta).toFixed(2));

    const deleted = transactionRepository.delete(transactionId);
    if (!deleted) {
      const error = new Error('Transaction could not be deleted.');
      error.code = 'DELETE_FAILED';
      error.statusCode = 400;
      throw error;
    }

    return { deleted: true, transaction_id: transactionId };
  }
}

module.exports = new TransactionService();
