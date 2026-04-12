'use strict';

const pool = require('../config/db');

/**
 * Insert in-app notification; on failure log to notification_delivery_log and console (UC-7 retry/log path).
 * @returns {Promise<boolean>} true if inserted
 */
async function notifyUser(userId, type, title, message) {
  try {
    await pool.query(
      `INSERT INTO notifications (user_id, type, title, message, is_read) VALUES (?, ?, ?, ?, FALSE)`,
      [userId, type, title, message]
    );
    return true;
  } catch (err) {
    const msg = (err && err.message) || String(err);
    console.error('[NOTIFICATION_DELIVERY_FAIL]', { userId, title, msg });
    try {
      await pool.query(
        `INSERT INTO notification_delivery_log (user_id, channel, notification_type, title, success, error_message)
         VALUES (?, 'in_app', ?, ?, 0, ?)`,
        [userId, type, title, msg.slice(0, 2000)]
      );
    } catch (logErr) {
      console.error('[NOTIFICATION_DELIVERY_LOG_FAIL]', logErr.message);
    }
    return false;
  }
}

module.exports = { notifyUser };
