const AccountService = require('./accountService');

const accountService = new AccountService();

const listAccounts = async (req, res, next) => {
  try {
    const accounts = await accountService.listAccounts(req.user.userId);
    return res.json({ accounts });
  } catch (error) {
    return next(error);
  }
};

const createAccount = async (req, res, next) => {
  try {
    const account = await accountService.createAccount(req.user.userId, req.body);
    return res.status(201).json({ account });
  } catch (error) {
    return next(error);
  }
};

const transferFunds = async (req, res, next) => {
  try {
    const transfer = await accountService.transfer(req.user.userId, req.body);
    return res.status(201).json(transfer);
  } catch (error) {
    return next(error);
  }
};

module.exports = { listAccounts, createAccount, transferFunds };
