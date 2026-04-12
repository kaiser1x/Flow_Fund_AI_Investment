'use strict';

const pool = require('../config/db');

// GET /api/notifications
exports.getNotifications = async (req, res) => {
  const uid = req.user?.user_id;
  console.log(`[NOTIF_GET] user_id=${uid}`);

  try {
    const [rows] = await pool.query(
      `SELECT notification_id, user_id, type, title, message, is_read, created_at
       FROM notifications
       WHERE user_id = ?
       ORDER BY created_at DESC
       LIMIT 50`,
      [uid]
    );

    const unread = rows.filter((r) => !r.is_read).length;
    console.log(`[NOTIF_GET] source=db count=${rows.length} unread=${unread}`);

    if (rows.length === 0) {
      console.log('[NOTIF_GET] no rows → empty list');
      return res.json({ notifications: [], isDemo: false });
    }

    res.json({ notifications: rows, isDemo: false });
  } catch (err) {
    console.error('[NOTIF_GET_ERROR]', err.message);
    res.json({ notifications: [], isDemo: false });
  }
};

// PATCH /api/notifications/:id/read  — mark one notification as read
exports.markOneRead = async (req, res) => {
  const uid = req.user?.user_id;
  const { id } = req.params;
  console.log(`[NOTIF_MARK_READ] user_id=${uid} notification_id=${id}`);

  try {
    const [result] = await pool.query(
      'UPDATE notifications SET is_read = TRUE WHERE notification_id = ? AND user_id = ?',
      [id, uid]
    );
    console.log(`[NOTIF_MARK_READ] updated=${result.affectedRows}`);
    res.json({ updated: result.affectedRows });
  } catch (err) {
    console.error('[NOTIF_MARK_READ_ERROR]', err.message);
    res.status(500).json({ error: 'Failed to mark notification as read' });
  }
};

// PATCH /api/notifications/read-all  — mark all notifications as read for user
exports.markAllRead = async (req, res) => {
  const uid = req.user?.user_id;
  console.log(`[NOTIF_MARK_ALL_READ] user_id=${uid}`);

  try {
    const [result] = await pool.query(
      'UPDATE notifications SET is_read = TRUE WHERE user_id = ? AND is_read = FALSE',
      [uid]
    );
    console.log(`[NOTIF_MARK_ALL_READ] updated=${result.affectedRows}`);
    res.json({ updated: result.affectedRows });
  } catch (err) {
    console.error('[NOTIF_MARK_ALL_READ_ERROR]', err.message);
    res.status(500).json({ error: 'Failed to mark all notifications as read' });
  }
};
