const accountRepository = require('./accountRepository');

class AccountService {
  listAccounts(userId) {
    return accountRepository.list(userId);
  }

  getAccountById(accountId) {
    const account = accountRepository.findById(accountId);
    if (!account) {
      const error = new Error('Account not found.');
      error.code = 'ACCOUNT_NOT_FOUND';
      error.statusCode = 404;
      throw error;
    }

    return account;
  }

  createAccount(data) {
    const requiredFields = ['user_id', 'account_type', 'account_name'];
    for (const field of requiredFields) {
      if (!data || !data[field]) {
        const error = new Error(`Field "${field}" is required.`);
        error.code = 'VALIDATION_ERROR';
        error.statusCode = 400;
        throw error;
      }
    }

    const balance = Number(data.balance ?? 0);
    if (!Number.isFinite(balance)) {
      const error = new Error('Account balance must be a valid number.');
      error.code = 'VALIDATION_ERROR';
      error.statusCode = 400;
      throw error;
    }

    return accountRepository.create({
      user_id: data.user_id,
      account_type: data.account_type,
      account_name: data.account_name,
      balance,
    });
  }

  updateAccount(accountId, changes) {
    const account = this.getAccountById(accountId);
    if (!account) {
      throw new Error('Account not found.');
    }

    if (changes.balance !== undefined && !Number.isFinite(Number(changes.balance))) {
      const error = new Error('Account balance must be a valid number.');
      error.code = 'VALIDATION_ERROR';
      error.statusCode = 400;
      throw error;
    }

    return accountRepository.update(accountId, changes);
  }

  deleteAccount(accountId) {
    const account = this.getAccountById(accountId);
    if (!account) {
      throw new Error('Account not found.');
    }

    const deleted = accountRepository.delete(accountId);
    if (!deleted) {
      const error = new Error('Account could not be deleted.');
      error.code = 'DELETE_FAILED';
      error.statusCode = 400;
      throw error;
    }

    return { deleted: true, account_id: accountId };
  }

  transferFunds(fromAccountId, toAccountId, amount) {
    const numericAmount = Number(amount);
    if (!Number.isFinite(numericAmount) || numericAmount <= 0) {
      const error = new Error('Transfer amount must be a valid number greater than zero.');
      error.code = 'VALIDATION_ERROR';
      error.statusCode = 400;
      throw error;
    }

    return accountRepository.transfer({
      fromAccountId,
      toAccountId,
      amount: numericAmount,
    });
  }
}

module.exports = new AccountService();
