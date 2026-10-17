const transactionService = require('./transactionService');

const listTransactions = async (req, res, next) => {
  try {
    const transactions = transactionService.listTransactions();
    res.json(transactions);
  } catch (error) {
    next(error);
  }
};

const getTransaction = async (req, res, next) => {
  try {
    const transaction = transactionService.getTransactionById(req.params.transactionId);
    res.json(transaction);
  } catch (error) {
    next(error);
  }
};

const createTransaction = async (req, res, next) => {
  try {
    const transaction = transactionService.createTransaction(req.body);
    res.status(201).json(transaction);
  } catch (error) {
    next(error);
  }
};

const updateTransaction = async (req, res, next) => {
  try {
    const transaction = transactionService.updateTransaction(req.params.transactionId, req.body);
    res.json(transaction);
  } catch (error) {
    next(error);
  }
};

const deleteTransaction = async (req, res, next) => {
  try {
    const result = transactionService.deleteTransaction(req.params.transactionId);
    res.json(result);
  } catch (error) {
    next(error);
  }
};

module.exports = {
  listTransactions,
  getTransaction,
  createTransaction,
  updateTransaction,
  deleteTransaction,
};
