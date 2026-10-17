const { transactions, makeId } = require('../store');

class TransactionRepository {
  list() {
    return [...transactions];
  }

  findById(transactionId) {
    return transactions.find((transaction) => transaction.transaction_id === transactionId);
  }

  create(data) {
    const transaction = {
      transaction_id: makeId('txn'),
      account_id: data.account_id,
      category_id: data.category_id || null,
      amount: Number(data.amount),
      date: data.date || new Date().toISOString().slice(0, 10),
      type: data.type,
      notes: data.notes || '',
      created_at: new Date().toISOString(),
    };

    transactions.push(transaction);
    return transaction;
  }

  update(transactionId, changes) {
    const transaction = this.findById(transactionId);
    if (!transaction) return null;

    if (changes.account_id !== undefined) transaction.account_id = changes.account_id;
    if (changes.category_id !== undefined) transaction.category_id = changes.category_id;
    if (changes.amount !== undefined) transaction.amount = Number(changes.amount);
    if (changes.date !== undefined) transaction.date = changes.date;
    if (changes.type !== undefined) transaction.type = changes.type;
    if (changes.notes !== undefined) transaction.notes = changes.notes;

    return transaction;
  }

  delete(transactionId) {
    const index = transactions.findIndex((transaction) => transaction.transaction_id === transactionId);
    if (index === -1) return false;

    transactions.splice(index, 1);
    return true;
  }
}

module.exports = new TransactionRepository();
