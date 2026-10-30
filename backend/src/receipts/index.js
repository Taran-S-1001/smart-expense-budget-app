const express = require('express');
const { authenticateToken } = require('../auth/jwt');
const { attachReceipt, getReceipt } = require('./receiptController');

const router = express.Router();

// Require authentication for all receipt operations per SEBM-F-012
router.use(authenticateToken);

router.post('/:transactionId', attachReceipt);
router.get('/:transactionId', getReceipt);

module.exports = router;
