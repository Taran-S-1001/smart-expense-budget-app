const express = require('express');
const {
  listTransactions,
  getTransaction,
  createTransaction,
  updateTransaction,
  deleteTransaction,
} = require('./transactionController');

const router = express.Router();

router.get('/', listTransactions);
router.post('/', createTransaction);
router.get('/:transactionId', getTransaction);
router.put('/:transactionId', updateTransaction);
router.delete('/:transactionId', deleteTransaction);

module.exports = router;
