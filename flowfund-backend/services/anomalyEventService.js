'use strict';

const pool = require('../config/db');

async function recordEvent(userId, { anomalyType, transactionId = null, severity = 'warning', details = {}, notificationSent = false }) {
  const json = JSON.stringify(details);
  await pool.query(
    `INSERT INTO anomaly_events (user_id, transaction_id, anomaly_type, severity, details, notification_sent)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [userId, transactionId, anomalyType, severity, json, notificationSent ? 1 : 0]
  );
}

async function hasRecentEvent(userId, anomalyType, sinceHours = 24) {
  const h = Math.min(168, Math.max(1, parseInt(sinceHours, 10) || 24));
  const [rows] = await pool.query(
    `SELECT 1 FROM anomaly_events
     WHERE user_id = ? AND anomaly_type = ?
       AND created_at >= DATE_SUB(NOW(), INTERVAL ${h} HOUR)
     LIMIT 1`,
    [userId, anomalyType]
  );
  return rows.length > 0;
}

/** Cooldown in minutes (anti-spam without blocking meaningful updates for a full day). */
async function hasRecentEventMinutes(userId, anomalyType, sinceMinutes = 15) {
  const m = Math.min(10080, Math.max(1, parseInt(sinceMinutes, 10) || 15));
  const [rows] = await pool.query(
    `SELECT 1 FROM anomaly_events
     WHERE user_id = ? AND anomaly_type = ?
       AND created_at >= DATE_SUB(NOW(), INTERVAL ? MINUTE)
     LIMIT 1`,
    [userId, anomalyType, m]
  );
  return rows.length > 0;
}

/** Same txn + type in last N days (dedupe anomaly spam) */
async function hasTxnAnomalyRecently(userId, transactionId, anomalyType, days = 7) {
  const d = Math.min(90, Math.max(1, parseInt(days, 10) || 7));
  const [rows] = await pool.query(
    `SELECT 1 FROM anomaly_events
     WHERE user_id = ? AND anomaly_type = ? AND transaction_id = ?
       AND created_at >= DATE_SUB(NOW(), INTERVAL ${d} DAY)
     LIMIT 1`,
    [userId, anomalyType, transactionId]
  );
  return rows.length > 0;
}

/** Latest logged readiness notification payload (for cooldown bypass when score moves again). */
async function getLatestReadinessScoreChangeDetails(userId) {
  const [rows] = await pool.query(
    `SELECT details FROM anomaly_events
     WHERE user_id = ? AND anomaly_type = 'readiness_score_change'
     ORDER BY created_at DESC LIMIT 1`,
    [userId]
  );
  if (!rows.length) return null;
  try {
    const d = JSON.parse(rows[0].details);
    return typeof d === 'object' && d !== null ? d : null;
  } catch {
    return null;
  }
}

async function hasGoalMilestone(userId, goalId, milestone) {
  const [rows] = await pool.query(
    `SELECT 1 FROM anomaly_events
     WHERE user_id = ? AND anomaly_type = 'goal_milestone'
       AND JSON_UNQUOTE(JSON_EXTRACT(details, '$.goal_id')) = ?
       AND JSON_UNQUOTE(JSON_EXTRACT(details, '$.milestone')) = ?
     LIMIT 1`,
    [userId, String(goalId), String(milestone)]
  );
  return rows.length > 0;
}

module.exports = {
  recordEvent,
  hasRecentEvent,
  hasRecentEventMinutes,
  getLatestReadinessScoreChangeDetails,
  hasTxnAnomalyRecently,
  hasGoalMilestone,
};
