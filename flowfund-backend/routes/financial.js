const express = require('express');
const router = express.Router();
const authMiddleware = require('../middleware/authMiddleware');
const { getSnapshot, getTransactions, getDemoCustomerAccounts } = require('../controllers/financialController');

router.get('/snapshot', authMiddleware, getSnapshot);
router.get('/transactions', authMiddleware, getTransactions);
router.get('/demo-customer-accounts', authMiddleware, getDemoCustomerAccounts);

module.exports = router;
