const { accounts, makeId } = require('../store');

class AccountRepository {
  list(userId) {
    if (!userId) return [...accounts];
    return accounts.filter((account) => account.user_id === userId);
  }

  findById(accountId) {
    return accounts.find((account) => account.account_id === accountId);
  }

  create(data) {
    const account = {
      account_id: makeId('acc'),
      user_id: data.user_id || 'user_1',
      account_type: data.account_type,
      account_name: data.account_name,
      balance: Number(data.balance || 0),
      created_at: new Date().toISOString(),
    };

    accounts.push(account);
    return account;
  }

  update(accountId, changes) {
    const account = this.findById(accountId);
    if (!account) return null;

    if (changes.account_type !== undefined) account.account_type = changes.account_type;
    if (changes.account_name !== undefined) account.account_name = changes.account_name;
    if (changes.balance !== undefined) account.balance = Number(changes.balance);
    if (changes.user_id !== undefined) account.user_id = changes.user_id;

    return account;
  }

  delete(accountId) {
    const index = accounts.findIndex((account) => account.account_id === accountId);
    if (index === -1) return false;

    accounts.splice(index, 1);
    return true;
  }

  transfer({ fromAccountId, toAccountId, amount }) {
    const fromAccount = this.findById(fromAccountId);
    const toAccount = this.findById(toAccountId);

    if (!fromAccount || !toAccount) {
      const error = new Error('Transfer accounts were not found.');
      error.code = 'INVALID_TRANSFER';
      error.statusCode = 404;
      throw error;
    }

    if (fromAccountId === toAccountId) {
      const error = new Error('Source and target accounts must be different.');
      error.code = 'INVALID_TRANSFER';
      error.statusCode = 400;
      throw error;
    }

    const numericAmount = Number(amount);
    if (!Number.isFinite(numericAmount) || numericAmount <= 0) {
      const error = new Error('Transfer amount must be greater than zero.');
      error.code = 'INVALID_TRANSFER';
      error.statusCode = 400;
      throw error;
    }

    if (fromAccount.balance < numericAmount) {
      const error = new Error('Insufficient funds for transfer.');
      error.code = 'INSUFFICIENT_FUNDS';
      error.statusCode = 400;
      throw error;
    }

    fromAccount.balance = Number((fromAccount.balance - numericAmount).toFixed(2));
    toAccount.balance = Number((toAccount.balance + numericAmount).toFixed(2));

    return {
      from_account: fromAccount,
      to_account: toAccount,
      amount: numericAmount,
    };
  }
}

module.exports = new AccountRepository();
