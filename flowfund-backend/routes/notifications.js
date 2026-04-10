'use strict';

const express = require('express');
const router = express.Router();
const authMiddleware = require('../middleware/authMiddleware');
const {
  getNotifications,
  markOneRead,
  markAllRead,
} = require('../controllers/notificationController');

// IMPORTANT: /read-all must be defined before /:id/read so Express doesn't
// try to match the literal string "read-all" as a notification :id.
router.get('/',             authMiddleware, getNotifications);
router.patch('/read-all',   authMiddleware, markAllRead);
router.patch('/:id/read',   authMiddleware, markOneRead);

module.exports = router;
