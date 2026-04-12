'use strict';

const express = require('express');
const router = express.Router();
const authMiddleware = require('../middleware/authMiddleware');
const adminSimulationMiddleware = require('../middleware/adminSimulationMiddleware');
const ctrl = require('../controllers/adminSimulationController');

router.use(authMiddleware, adminSimulationMiddleware);

router.get('/users/:userId/accounts', ctrl.listAccounts);
router.get('/users/:userId/transactions', ctrl.listTransactions);
router.post('/users/:userId/plaid-sync', ctrl.plaidSyncForUser);
router.post('/users/:userId/plaid-transactions-refresh', ctrl.plaidTransactionsRefreshForUser);
router.post('/users/:userId/transactions', ctrl.createDemoCustomerTransaction);
router.patch('/transactions/:txnId', ctrl.updateDemoCustomerTransaction);
router.delete('/transactions/:txnId', ctrl.deleteDemoCustomerTransaction);

module.exports = router;
