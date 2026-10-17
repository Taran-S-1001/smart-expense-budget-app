const express = require('express');
const accountsRouter = require('./accounts');
const transactionsRouter = require('./transactions');

const router = express.Router();

router.use('/accounts', accountsRouter);
router.use('/transactions', transactionsRouter);

module.exports = router;
