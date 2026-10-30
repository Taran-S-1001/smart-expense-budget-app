const express = require('express');
const { authenticateToken } = require('../auth/jwt');
const { createAccount, listAccounts, transferFunds } = require('./accountController');

const router = express.Router();

router.use(authenticateToken);
router.get('/', listAccounts);
router.post('/', createAccount);
router.post('/transfer', transferFunds);

module.exports = router;
