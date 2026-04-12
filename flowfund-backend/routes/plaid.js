const express = require('express');
const router = express.Router();
const authMiddleware = require('../middleware/authMiddleware');
const {
  createLinkToken,
  exchangePublicToken,
  getAccounts,
  getTransactions,
  postSync,
  transactionsRefresh,
  getBalances,
  disconnectPlaid,
} = require('../controllers/plaidController');

// Authenticated Plaid routes
router.post('/create-link-token', authMiddleware, createLinkToken);
router.post('/exchange-public-token', authMiddleware, exchangePublicToken);
router.get('/accounts', authMiddleware, getAccounts);
router.get('/transactions', authMiddleware, getTransactions);
router.post('/sync', authMiddleware, postSync);
router.post('/transactions-refresh', authMiddleware, transactionsRefresh);
router.get('/balances', authMiddleware, getBalances);
router.delete('/link', authMiddleware, disconnectPlaid);

module.exports = router;
