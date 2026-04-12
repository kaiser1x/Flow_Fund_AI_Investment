'use strict';

const express = require('express');
const router  = express.Router();
const authMiddleware = require('../middleware/authMiddleware');
const { getReadiness, getStockIdeas } = require('../controllers/investmentReadinessController');

router.get('/stock-ideas', authMiddleware, getStockIdeas);
router.get('/', authMiddleware, getReadiness);

module.exports = router;
