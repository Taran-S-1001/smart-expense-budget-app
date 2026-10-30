const TransactionService = require('./transactionService');

const transactionService = new TransactionService();

const listTransactions = async (req, res, next) => {
  try {
    const transactions = await transactionService.listTransactions(req.user.userId);
    return res.json({ transactions });
  } catch (error) {
    return next(error);
  }
};

const listCategories = async (req, res, next) => {
  try {
    const categories = await transactionService.listCategories(req.user.userId);
    return res.json({ categories });
  } catch (error) {
    return next(error);
  }
};

const createCategory = async (req, res, next) => {
  try {
    const category = await transactionService.createCategory(req.user.userId, req.body);
    return res.status(201).json({ category });
  } catch (error) {
    return next(error);
  }
};

const createTransaction = async (req, res, next) => {
  try {
    const transaction = await transactionService.createTransaction(req.user.userId, req.body);
    return res.status(201).json(transaction);
  } catch (error) {
    return next(error);
  }
};

const updateTransaction = async (req, res, next) => {
  try {
    const transaction = await transactionService.updateTransaction(
      req.user.userId,
      req.params.transactionId,
      req.body,
    );
    return res.json(transaction);
  } catch (error) {
    return next(error);
  }
};

const deleteTransaction = async (req, res, next) => {
  try {
    const result = await transactionService.deleteTransaction(req.user.userId, req.params.transactionId);
    return res.json(result);
  } catch (error) {
    return next(error);
  }
};

module.exports = {
  listTransactions,
  listCategories,
  createCategory,
  createTransaction,
  updateTransaction,
  deleteTransaction,
};
