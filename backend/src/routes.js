const express = require('express');

const authRouter = require('./auth');
const transactionsRouter = require('./transactions');
const budgetsRouter = require('./budgets');
const accountsRouter = require('./accounts');
const reportsRouter = require('./reports');
const notificationsRouter = require('./notifications');
const adminRouter = require('./admin');
const receiptsRouter = require('./receipts');
const remindersRouter = require('./reminders');

const router = express.Router();

router.use('/auth', authRouter);
router.use('/transactions', transactionsRouter);
router.use('/budgets', budgetsRouter);
router.use('/accounts', accountsRouter);
router.use('/reports', reportsRouter);
router.use('/notifications', notificationsRouter);
router.use('/admin', adminRouter);
router.use('/receipts', receiptsRouter);
router.use('/reminders', remindersRouter);
router.use('/bill-reminders', remindersRouter);

module.exports = router;
