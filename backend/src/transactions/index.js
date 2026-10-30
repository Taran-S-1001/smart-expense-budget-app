const express = require('express');
const { authenticateToken } = require('../auth/jwt');
const {
  createTransaction,
  listCategories,
  createCategory,
  listTransactions,
  updateTransaction,
  deleteTransaction,
} = require('./transactionController');

const router = express.Router();

router.use(authenticateToken);
router.get('/categories', listCategories);
router.post('/categories', createCategory);
router.get('/', listTransactions);
router.post('/', createTransaction);
router.put('/:transactionId', updateTransaction);
router.delete('/:transactionId', deleteTransaction);

module.exports = router;
