const express = require('express');
const {
  listAccounts,
  getAccount,
  createAccount,
  updateAccount,
  deleteAccount,
  transferFunds,
} = require('./accountController');

const router = express.Router();

router.get('/', listAccounts);
router.post('/', createAccount);
router.get('/:accountId', getAccount);
router.put('/:accountId', updateAccount);
router.delete('/:accountId', deleteAccount);
router.post('/transfer', transferFunds);

module.exports = router;
