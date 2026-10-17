const accountService = require('./accountService');

const listAccounts = async (req, res, next) => {
  try {
    const userId = req.query.user_id || req.user?.id || 'user_1';
    const accounts = accountService.listAccounts(userId);
    res.json(accounts);
  } catch (error) {
    next(error);
  }
};

const getAccount = async (req, res, next) => {
  try {
    const { accountId } = req.params;
    const account = accountService.getAccountById(accountId);
    res.json(account);
  } catch (error) {
    next(error);
  }
};

const createAccount = async (req, res, next) => {
  try {
    const account = accountService.createAccount(req.body);
    res.status(201).json(account);
  } catch (error) {
    next(error);
  }
};

const updateAccount = async (req, res, next) => {
  try {
    const account = accountService.updateAccount(req.params.accountId, req.body);
    res.json(account);
  } catch (error) {
    next(error);
  }
};

const deleteAccount = async (req, res, next) => {
  try {
    const result = accountService.deleteAccount(req.params.accountId);
    res.json(result);
  } catch (error) {
    next(error);
  }
};

const transferFunds = async (req, res, next) => {
  try {
    const { from_account_id, to_account_id, amount } = req.body;
    const result = accountService.transferFunds(from_account_id, to_account_id, amount);
    res.json(result);
  } catch (error) {
    next(error);
  }
};

module.exports = {
  listAccounts,
  getAccount,
  createAccount,
  updateAccount,
  deleteAccount,
  transferFunds,
};
