'use strict';

const pool = require('../config/db');

const DEFAULTS = {
  anomaly_amount_enabled: true,
  anomaly_amount_multiplier: 2.0,
  spending_spike_enabled: true,
  low_cash_buffer_enabled: true,
  low_cash_buffer_threshold_months: 1.0,
  readiness_change_enabled: true,
  readiness_change_min_points: 1,
  goal_milestone_enabled: true,
  weekly_expense_highlight_enabled: true,
};

function mapRow(row) {
  if (!row) return { ...DEFAULTS };
  return {
    anomaly_amount_enabled: Boolean(row.anomaly_amount_enabled),
    anomaly_amount_multiplier: Math.max(1.01, parseFloat(row.anomaly_amount_multiplier) || DEFAULTS.anomaly_amount_multiplier),
    spending_spike_enabled: Boolean(row.spending_spike_enabled),
    low_cash_buffer_enabled: Boolean(row.low_cash_buffer_enabled),
    low_cash_buffer_threshold_months: Math.max(0.1, parseFloat(row.low_cash_buffer_threshold_months) || DEFAULTS.low_cash_buffer_threshold_months),
    readiness_change_enabled: Boolean(row.readiness_change_enabled),
    readiness_change_min_points: Math.max(1, parseInt(row.readiness_change_min_points, 10) || DEFAULTS.readiness_change_min_points),
    goal_milestone_enabled: Boolean(row.goal_milestone_enabled),
    weekly_expense_highlight_enabled: Boolean(row.weekly_expense_highlight_enabled),
  };
}

async function getPreferences(userId) {
  const [rows] = await pool.query('SELECT * FROM user_alert_preferences WHERE user_id = ? LIMIT 1', [userId]);
  if (!rows.length) return { ...DEFAULTS, _persisted: false };
  return { ...mapRow(rows[0]), _persisted: true };
}

async function upsertPreferences(userId, body) {
  const cur = await getPreferences(userId);
  const next = {
    anomaly_amount_enabled:
      body.anomaly_amount_enabled !== undefined ? Boolean(body.anomaly_amount_enabled) : cur.anomaly_amount_enabled,
    anomaly_amount_multiplier:
      body.anomaly_amount_multiplier !== undefined
        ? Math.max(1.01, Math.min(10, parseFloat(body.anomaly_amount_multiplier) || cur.anomaly_amount_multiplier))
        : cur.anomaly_amount_multiplier,
    spending_spike_enabled:
      body.spending_spike_enabled !== undefined ? Boolean(body.spending_spike_enabled) : cur.spending_spike_enabled,
    low_cash_buffer_enabled:
      body.low_cash_buffer_enabled !== undefined ? Boolean(body.low_cash_buffer_enabled) : cur.low_cash_buffer_enabled,
    low_cash_buffer_threshold_months:
      body.low_cash_buffer_threshold_months !== undefined
        ? Math.max(0.1, Math.min(12, parseFloat(body.low_cash_buffer_threshold_months) || cur.low_cash_buffer_threshold_months))
        : cur.low_cash_buffer_threshold_months,
    readiness_change_enabled:
      body.readiness_change_enabled !== undefined ? Boolean(body.readiness_change_enabled) : cur.readiness_change_enabled,
    readiness_change_min_points:
      body.readiness_change_min_points !== undefined
        ? Math.max(1, Math.min(50, parseInt(body.readiness_change_min_points, 10) || cur.readiness_change_min_points))
        : cur.readiness_change_min_points,
    goal_milestone_enabled:
      body.goal_milestone_enabled !== undefined ? Boolean(body.goal_milestone_enabled) : cur.goal_milestone_enabled,
    weekly_expense_highlight_enabled:
      body.weekly_expense_highlight_enabled !== undefined
        ? Boolean(body.weekly_expense_highlight_enabled)
        : cur.weekly_expense_highlight_enabled,
  };

  await pool.query(
    `INSERT INTO user_alert_preferences
       (user_id, anomaly_amount_enabled, anomaly_amount_multiplier, spending_spike_enabled,
        low_cash_buffer_enabled, low_cash_buffer_threshold_months, readiness_change_enabled,
        readiness_change_min_points, goal_milestone_enabled, weekly_expense_highlight_enabled)
     VALUES (?,?,?,?,?,?,?,?,?,?)
     ON DUPLICATE KEY UPDATE
       anomaly_amount_enabled = VALUES(anomaly_amount_enabled),
       anomaly_amount_multiplier = VALUES(anomaly_amount_multiplier),
       spending_spike_enabled = VALUES(spending_spike_enabled),
       low_cash_buffer_enabled = VALUES(low_cash_buffer_enabled),
       low_cash_buffer_threshold_months = VALUES(low_cash_buffer_threshold_months),
       readiness_change_enabled = VALUES(readiness_change_enabled),
       readiness_change_min_points = VALUES(readiness_change_min_points),
       goal_milestone_enabled = VALUES(goal_milestone_enabled),
       weekly_expense_highlight_enabled = VALUES(weekly_expense_highlight_enabled)`,
    [
      userId,
      next.anomaly_amount_enabled ? 1 : 0,
      next.anomaly_amount_multiplier,
      next.spending_spike_enabled ? 1 : 0,
      next.low_cash_buffer_enabled ? 1 : 0,
      next.low_cash_buffer_threshold_months,
      next.readiness_change_enabled ? 1 : 0,
      next.readiness_change_min_points,
      next.goal_milestone_enabled ? 1 : 0,
      next.weekly_expense_highlight_enabled ? 1 : 0,
    ]
  );

  const fresh = await getPreferences(userId);
  delete fresh._persisted;
  return fresh;
}

module.exports = {
  getPreferences,
  upsertPreferences,
  DEFAULTS,
};
