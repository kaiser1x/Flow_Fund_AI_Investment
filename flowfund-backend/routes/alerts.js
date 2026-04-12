'use strict';

const express = require('express');
const router = express.Router();
const authMiddleware = require('../middleware/authMiddleware');
const {
  getAlertPreferences,
  putAlertPreferences,
  listAnomalyEvents,
} = require('../controllers/alertsController');

router.get('/preferences', authMiddleware, getAlertPreferences);
router.put('/preferences', authMiddleware, putAlertPreferences);
router.get('/anomalies', authMiddleware, listAnomalyEvents);

module.exports = router;
