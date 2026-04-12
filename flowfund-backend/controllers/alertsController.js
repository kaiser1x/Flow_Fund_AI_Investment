'use strict';

const pool = require('../config/db');
const alertPreferencesService = require('../services/alertPreferencesService');

exports.getAlertPreferences = async (req, res) => {
  try {
    const p = await alertPreferencesService.getPreferences(req.user.user_id);
    const out = { ...p };
    delete out._persisted;
    res.json(out);
  } catch (err) {
    console.error('[ALERT_PREFS_GET]', err.message);
    res.status(500).json({ error: 'Failed to load alert preferences' });
  }
};

exports.putAlertPreferences = async (req, res) => {
  try {
    const p = await alertPreferencesService.upsertPreferences(req.user.user_id, req.body || {});
    res.json(p);
  } catch (err) {
    console.error('[ALERT_PREFS_PUT]', err.message);
    res.status(500).json({ error: 'Failed to save alert preferences' });
  }
};

exports.listAnomalyEvents = async (req, res) => {
  const uid = req.user.user_id;
  const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 40));
  try {
    const [rows] = await pool.query(
      `SELECT anomaly_id, transaction_id, anomaly_type, severity, details, notification_sent, created_at
       FROM anomaly_events WHERE user_id = ? ORDER BY created_at DESC LIMIT ?`,
      [uid, limit]
    );
    const events = rows.map((r) => {
      let details = r.details;
      if (details != null && typeof details === 'string') {
        try {
          details = JSON.parse(details);
        } catch (_) {
          /* keep raw */
        }
      }
      return { ...r, details };
    });
    res.json({ events });
  } catch (err) {
    console.error('[ANOMALY_LIST]', err.message);
    res.status(500).json({ error: 'Failed to load anomaly log' });
  }
};
