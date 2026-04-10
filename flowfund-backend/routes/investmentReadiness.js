'use strict';

const express = require('express');
const router  = express.Router();
const authMiddleware = require('../middleware/authMiddleware');
const { getReadiness } = require('../controllers/investmentReadinessController');

router.get('/', authMiddleware, getReadiness);

module.exports = router;
