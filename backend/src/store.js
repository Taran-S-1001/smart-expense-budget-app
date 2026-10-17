const { v4: uuidv4 } = require('uuid');

const defaultAccounts = [
  {
    account_id: 'acc_1',
    user_id: 'user_1',
    account_type: 'checking',
    account_name: 'Main checking',
    balance: 2500,
    created_at: new Date().toISOString(),
  },
  {
    account_id: 'acc_2',
    user_id: 'user_1',
    account_type: 'savings',
    account_name: 'Emergency fund',
    balance: 6000,
    created_at: new Date().toISOString(),
  },
];

const defaultTransactions = [
  {
    transaction_id: 'txn_1',
    account_id: 'acc_1',
    category_id: 'cat_1',
    amount: 120,
    date: '2026-10-16',
    type: 'Expense',
    notes: 'Groceries',
    created_at: new Date().toISOString(),
  },
  {
    transaction_id: 'txn_2',
    account_id: 'acc_2',
    category_id: 'cat_2',
    amount: 500,
    date: '2026-10-17',
    type: 'Income',
    notes: 'Salary deposit',
    created_at: new Date().toISOString(),
  },
];

const defaultCategories = [
  { category_id: 'cat_1', user_id: 'user_1', name: 'Groceries', type: 'Expense', is_custom: false },
  { category_id: 'cat_2', user_id: 'user_1', name: 'Salary', type: 'Income', is_custom: false },
];

const accounts = [];
const transactions = [];
const categories = [];

const resetStore = () => {
  accounts.splice(0, accounts.length, ...defaultAccounts.map((entry) => ({ ...entry })));
  transactions.splice(0, transactions.length, ...defaultTransactions.map((entry) => ({ ...entry })));
  categories.splice(0, categories.length, ...defaultCategories.map((entry) => ({ ...entry })));
};

resetStore();

const makeId = (prefix) => `${prefix}_${uuidv4()}`;

module.exports = {
  accounts,
  transactions,
  categories,
  makeId,
  resetStore,
};
