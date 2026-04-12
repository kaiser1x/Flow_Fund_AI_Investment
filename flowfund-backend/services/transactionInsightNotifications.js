'use strict';

const pool = require('../config/db');
const { notifyUser } = require('./safeNotification');

const WELCOME_TITLE = 'Welcome to FlowFund AI';
const SYNC_TITLE = 'Sync complete';
const MANUAL_LEDGER_TITLE = 'Demo ledger updated';

async function hasLinkedPlaid(userId) {
  const [rows] = await pool.query('SELECT COUNT(*) AS c FROM plaid_items WHERE user_id = ?', [userId]);
  return (rows[0]?.c || 0) > 0;
}

async function hasWelcomeNotification(userId) {
  const [rows] = await pool.query(
    'SELECT 1 FROM notifications WHERE user_id = ? AND title = ? LIMIT 1',
    [userId, WELCOME_TITLE]
  );
  return rows.length > 0;
}

async function transactionCount(userId) {
  const [rows] = await pool.query(
    `SELECT COUNT(*) AS c
     FROM transactions t
     INNER JOIN bank_accounts b ON t.account_id = b.account_id
     WHERE b.user_id = ?`,
    [userId]
  );
  return parseInt(rows[0]?.c, 10) || 0;
}

async function totalBalance(userId) {
  const [rows] = await pool.query(
    'SELECT COALESCE(SUM(balance), 0) AS s FROM bank_accounts WHERE user_id = ?',
    [userId]
  );
  return parseFloat(rows[0]?.s) || 0;
}

async function topExpenseCategoryLast30(userId) {
  const [rows] = await pool.query(
    `SELECT t.category AS category, COALESCE(SUM(t.amount), 0) AS total
     FROM transactions t
     INNER JOIN bank_accounts b ON t.account_id = b.account_id
     WHERE b.user_id = ?
       AND t.transaction_type = 'EXPENSE'
       AND t.transaction_date >= DATE_SUB(CURDATE(), INTERVAL 30 DAY)
     GROUP BY t.category
     ORDER BY total DESC
     LIMIT 1`,
    [userId]
  );
  if (!rows.length) return null;
  const r = rows[0];
  return { category: r.category || 'Uncategorized', total: parseFloat(r.total) || 0 };
}

/**
 * Call after Plaid transaction sync. Creates welcome (once), sync summary, optional insights.
 * @param {number} userId
 * @param {{ imported?: number, removed?: number, notificationContext?: 'explicit_pull' }} opts
 *   — imported = added + modified; removed = deleted in this pass; explicit_pull = user clicked refresh/sync
 */
async function runAfterTransactionSync(userId, opts = {}) {
  const imported = Math.max(0, parseInt(opts.imported, 10) || 0);
  const removed = Math.max(0, parseInt(opts.removed, 10) || 0);
  const explicitPull = opts.notificationContext === 'explicit_pull';

  try {
    if (!(await hasLinkedPlaid(userId))) return;

    const count = await transactionCount(userId);
    const welcomeDone = await hasWelcomeNotification(userId);

    if (!welcomeDone) {
      const bal = await totalBalance(userId);
      let message =
        "You're connected to FlowFund AI. We'll keep your dashboard updated when you sync from your bank.";
      if (count > 0) {
        const top = await topExpenseCategoryLast30(userId);
        message += ` We pulled ${count} transaction${count === 1 ? '' : 's'}`;
        if (top && top.total > 0) {
          message += `. Your top spending category in the last 30 days is ${top.category} ($${top.total.toFixed(2)}).`;
        }
        message += ` Total balance across linked accounts: $${bal.toFixed(2)}.`;
      } else {
        message += ' Run a sync from the dashboard to import your latest activity.';
      }
      await notifyUser(userId, 'system', WELCOME_TITLE, message);
    }

    if (imported > 0) {
      await notifyUser(
        userId,
        'system',
        SYNC_TITLE,
        `We added or updated ${imported} transaction${imported === 1 ? '' : 's'} from your bank.`
      );
    } else if (removed > 0) {
      await notifyUser(
        userId,
        'system',
        SYNC_TITLE,
        `Bank sync removed ${removed} stale transaction${removed === 1 ? '' : 's'} from your ledger.`
      );
    } else if (explicitPull) {
      await notifyUser(
        userId,
        'system',
        SYNC_TITLE,
        'Bank sync finished. Plaid reported no new or changed transactions this time. If you edited Sandbox data, wait a few seconds and sync again.'
      );
    }
  } catch (err) {
    console.error('[TXN_INSIGHT_NOTIFS]', err.message);
  }
}

/**
 * FlowFund Customer Demo manual row (admin sim / demo_seed) — works with or without Plaid linked.
 */
async function notifyManualDemoLedgerChange(userId, message) {
  try {
    await notifyUser(userId, 'system', MANUAL_LEDGER_TITLE, message);
  } catch (err) {
    console.error('[TXN_INSIGHT_NOTIFS] manual ledger', err.message);
  }
}

module.exports = {
  runAfterTransactionSync,
  notifyManualDemoLedgerChange,
  WELCOME_TITLE,
  SYNC_TITLE,
  MANUAL_LEDGER_TITLE,
};
