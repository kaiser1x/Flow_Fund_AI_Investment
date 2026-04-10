'use strict';

const pool = require('../config/db');

// ── Demo seed (returned when user has no real notifications) ──────────────────
function getDemoNotifications() {
  const ago = (ms) => new Date(Date.now() - ms).toISOString();
  return [
    {
      notification_id: 'demo-1',
      type: 'spending_alert',
      title: 'Spending Alert',
      message: 'Your Food & Drink spending is 28% higher than last month.',
      is_read: false,
      created_at: ago(2 * 3600 * 1000),   // 2 hours ago
    },
    {
      notification_id: 'demo-2',
      type: 'large_transaction',
      title: 'Large Transaction Detected',
      message: 'A $89.00 charge at Textbooks Online was recorded.',
      is_read: false,
      created_at: ago(24 * 3600 * 1000),  // 1 day ago
    },
    {
      notification_id: 'demo-3',
      type: 'budget_warning',
      title: 'Budget Warning',
      message: 'You have used 85% of your estimated monthly budget.',
      is_read: true,
      created_at: ago(48 * 3600 * 1000),  // 2 days ago
    },
    {
      notification_id: 'demo-4',
      type: 'system',
      title: 'Welcome to FlowFund AI!',
      message: 'Connect a bank account to unlock personalized spending insights and alerts.',
      is_read: true,
      created_at: ago(72 * 3600 * 1000),  // 3 days ago
    },
  ];
}

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
      const demo = getDemoNotifications();
      const demoUnread = demo.filter((n) => !n.is_read).length;
      console.log(`[NOTIF_GET] source=demo count=${demo.length} unread=${demoUnread}`);
      return res.json({ notifications: demo, isDemo: true });
    }

    res.json({ notifications: rows, isDemo: false });
  } catch (err) {
    console.error('[NOTIF_GET_ERROR]', err.message);
    // Graceful fallback — never crash the page over notifications
    const demo = getDemoNotifications();
    res.json({ notifications: demo, isDemo: true });
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
