'use strict';

const pool = require('../config/db');
const getPlaidClient = require('../config/plaid');
const { decrypt } = require('../utils/encrypt');
const transactionSyncService = require('../services/transactionSyncService');
const metricsService = require('../services/metricsService');
const alertMonitorService = require('../services/alertMonitorService');
const transactionInsightNotifications = require('../services/transactionInsightNotifications');
const {
  DEMO_BANK_NAME,
  isCustomerFlowfundUserId,
  ensureCustomerFlowfundSeed,
} = require('../services/customerFlowfundDemo');

function parseUserId(param) {
  const n = parseInt(param, 10);
  if (!Number.isFinite(n) || n < 1 || n > 2147483647) return null;
  return n;
}

function toYmd(v) {
  if (v == null) return new Date().toISOString().slice(0, 10);
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  return String(v).slice(0, 10);
}

function balanceDelta(accountType, transactionType, amount) {
  if (accountType === 'CREDIT') return 0;
  const a = Math.abs(parseFloat(amount)) || 0;
  return transactionType === 'INCOME' ? a : -a;
}

async function requireDemoCustomer(userId, res) {
  if (!userId) {
    res.status(400).json({ error: 'Invalid user id' });
    return false;
  }
  if (!(await isCustomerFlowfundUserId(userId))) {
    res.status(403).json({
      error:
        `Direct transaction edits are only for the demo customer (${process.env.DEMO_CUSTOMER_EMAIL || 'customer_flowfund@flowfund.demo'}). Plaid-linked data: change Sandbox JSON in Plaid Dashboard, then Sync.`,
    });
    return false;
  }
  return true;
}

/** Demo manual account only (not Plaid-backed rows). */
async function getDemoManualAccount(conn, accountId, userId) {
  const [rows] = await conn.query(
    `SELECT account_id, account_type FROM bank_accounts
     WHERE account_id = ? AND user_id = ? AND plaid_account_id IS NULL AND bank_name = ? LIMIT 1`,
    [accountId, userId, DEMO_BANK_NAME]
  );
  return rows[0] || null;
}

exports.listAccounts = async (req, res) => {
  const userId = parseUserId(req.params.userId);
  if (!userId) return res.status(400).json({ error: 'Invalid user id' });
  try {
    const [[u]] = await pool.query('SELECT email FROM users WHERE user_id = ? LIMIT 1', [userId]);
    if (u?.email) {
      await ensureCustomerFlowfundSeed(userId, u.email);
    }
    const [rows] = await pool.query(
      `SELECT account_id, bank_name, account_type, balance, mask, plaid_account_id
       FROM bank_accounts WHERE user_id = ? ORDER BY account_id`,
      [userId]
    );
    res.json({ accounts: rows });
  } catch (err) {
    console.error('[ADMIN_SIM] listAccounts', err.message);
    res.status(500).json({ error: 'Failed to list accounts' });
  }
};

exports.listTransactions = async (req, res) => {
  const userId = parseUserId(req.params.userId);
  if (!userId) return res.status(400).json({ error: 'Invalid user id' });
  const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 50));
  try {
    const [rows] = await pool.query(
      `SELECT t.transaction_id, t.plaid_transaction_id, t.account_id, t.amount, t.transaction_type, t.category,
              t.description, t.transaction_date,
              COALESCE(NULLIF(t.merchant_name, ''), t.description, '') AS merchant_name,
              COALESCE(t.pending, 0) AS pending,
              COALESCE(t.source, 'plaid') AS source
       FROM transactions t
       INNER JOIN bank_accounts b ON t.account_id = b.account_id
       WHERE b.user_id = ?
       ORDER BY t.transaction_date DESC, t.transaction_id DESC
       LIMIT ?`,
      [userId, limit]
    );
    res.json({ transactions: rows });
  } catch (err) {
    console.error('[ADMIN_SIM] listTx', err.message);
    res.status(500).json({ error: 'Failed to list transactions' });
  }
};

exports.plaidSyncForUser = async (req, res) => {
  const userId = parseUserId(req.params.userId);
  if (!userId) return res.status(400).json({ error: 'Invalid user id' });
  try {
    const [items] = await pool.query(
      'SELECT COUNT(*) AS c FROM plaid_items WHERE user_id = ?',
      [userId]
    );
    if ((items[0]?.c || 0) === 0) {
      return res.status(400).json({
        error:
          'No Plaid Item for this user. Link a Sandbox bank (custom user JSON in Plaid Dashboard), then sync pulls real Plaid transactions into this app.',
      });
    }
    const result = await transactionSyncService.syncAllItemsForUser(userId, {
      notificationContext: 'explicit_pull',
    });
    res.json({
      ok: true,
      message: 'Pulled from Plaid via /transactions/sync. Demo manual account + Plaid accounts both feed metrics.',
      ...result,
    });
  } catch (err) {
    console.error('[ADMIN_SIM] plaidSync', err?.response?.data || err.message);
    res.status(500).json({ error: 'Plaid sync failed', detail: err?.response?.data?.error_message || err.message });
  }
};

exports.plaidTransactionsRefreshForUser = async (req, res) => {
  const userId = parseUserId(req.params.userId);
  if (!userId) return res.status(400).json({ error: 'Invalid user id' });
  try {
    const plaidClient = getPlaidClient();
    const [dbItems] = await pool.query(
      'SELECT access_token_encrypted FROM plaid_items WHERE user_id = ?',
      [userId]
    );
    if (dbItems.length === 0) {
      return res.status(400).json({ error: 'No linked Plaid items for this user.' });
    }

    const refreshErrors = [];
    for (const item of dbItems) {
      const access_token = decrypt(item.access_token_encrypted);
      try {
        await plaidClient.transactionsRefresh({ access_token });
      } catch (err) {
        const pe = err?.response?.data;
        refreshErrors.push(pe?.error_code || err.message);
        console.error('[ADMIN_SIM][PLAID_REFRESH]', pe || err.message);
      }
    }

    const syncResult = await transactionSyncService.syncAllItemsForUser(userId, {
      notificationContext: 'explicit_pull',
    });
    res.json({
      ok: true,
      message: 'Sandbox refresh + sync complete.',
      refresh_errors: refreshErrors,
      ...syncResult,
    });
  } catch (err) {
    console.error('[ADMIN_SIM] plaidRefresh', err?.response?.data || err.message);
    res.status(500).json({ error: 'Plaid refresh + sync failed', detail: err?.response?.data?.error_message || err.message });
  }
};

exports.createDemoCustomerTransaction = async (req, res) => {
  const userId = parseUserId(req.params.userId);
  if (!(await requireDemoCustomer(userId, res))) return;

  const {
    account_id: accountIdRaw,
    amount: amountRaw,
    transaction_type: typeRaw,
    description,
    category,
    transaction_date: dateRaw,
    merchant_name,
  } = req.body || {};

  const accountId = parseInt(accountIdRaw, 10);
  if (!Number.isFinite(accountId) || accountId <= 0) {
    return res.status(400).json({ error: 'account_id required (use FlowFund Customer Demo account)' });
  }

  const acc = await getDemoManualAccount(pool, accountId, userId);
  if (!acc) {
    return res.status(400).json({ error: `Use the manual demo account "${DEMO_BANK_NAME}" only (not Plaid-linked accounts).` });
  }

  const amt = Math.abs(parseFloat(amountRaw));
  if (!Number.isFinite(amt) || amt <= 0) return res.status(400).json({ error: 'amount must be positive' });
  const type = String(typeRaw || '').toUpperCase() === 'INCOME' ? 'INCOME' : 'EXPENSE';
  const date =
    typeof dateRaw === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(dateRaw.trim())
      ? dateRaw.trim()
      : new Date().toISOString().slice(0, 10);
  const desc = (description && String(description).trim()) || (type === 'INCOME' ? 'Income' : 'Expense');
  const cat = (category && String(category).trim()) || 'General';
  const merch = merchant_name != null && String(merchant_name).trim() ? String(merchant_name).trim() : null;

  try {
    await pool.query(
      `INSERT INTO transactions
         (account_id, amount, transaction_type, category, description, transaction_date, merchant_name, pending, source)
       VALUES (?, ?, ?, ?, ?, ?, ?, FALSE, 'admin_sim')`,
      [accountId, amt, type, cat, desc, date, merch]
    );

    const d = balanceDelta(acc.account_type, type, amt);
    if (d !== 0) {
      await pool.query('UPDATE bank_accounts SET balance = balance + ? WHERE account_id = ?', [d, accountId]);
    }

    const metrics = await metricsService.calculate(userId);
    void alertMonitorService.runAfterSync(userId, { imported: 1, metrics });
    void transactionInsightNotifications.notifyManualDemoLedgerChange(
      userId,
      `Added a ${type === 'INCOME' ? 'deposit' : 'expense'} of $${amt.toFixed(2)} (${desc}). Category: ${cat}. Your FlowFund Customer Demo balance and insights were updated.`
    );

    res.status(201).json({ ok: true, metrics_summary: { score: metrics.score } });
  } catch (err) {
    console.error('[ADMIN_SIM] create', err.message);
    res.status(500).json({ error: 'Failed to create transaction' });
  }
};

exports.updateDemoCustomerTransaction = async (req, res) => {
  const txnId = parseInt(req.params.txnId, 10);
  if (!Number.isFinite(txnId) || txnId <= 0) return res.status(400).json({ error: 'Invalid transaction id' });
  const userId = parseUserId(req.body?.user_id);
  if (!(await requireDemoCustomer(userId, res))) return;

  try {
    const [oldRows] = await pool.query(
      `SELECT t.transaction_id, t.account_id, t.amount, t.transaction_type, t.transaction_date,
              t.description, t.category, t.merchant_name, b.account_type
       FROM transactions t
       INNER JOIN bank_accounts b ON t.account_id = b.account_id
       WHERE t.transaction_id = ? AND b.user_id = ? AND b.plaid_account_id IS NULL AND b.bank_name = ?
       LIMIT 1`,
      [txnId, userId, DEMO_BANK_NAME]
    );
    if (!oldRows.length) {
      return res.status(404).json({ error: 'Not found or not editable (Plaid-imported txns: change Sandbox + Sync).' });
    }
    const old = oldRows[0];

    const next = {
      amount: parseFloat(old.amount),
      transaction_type: old.transaction_type,
      transaction_date: toYmd(old.transaction_date),
      description: old.description || '',
      category: old.category || '',
      merchant_name: old.merchant_name,
    };

    if (req.body.amount != null) {
      const a = Math.abs(parseFloat(req.body.amount));
      if (Number.isFinite(a) && a > 0) next.amount = a;
    }
    if (req.body.transaction_type != null) {
      const t = String(req.body.transaction_type).toUpperCase();
      if (t === 'INCOME' || t === 'EXPENSE') next.transaction_type = t;
    }
    if (req.body.transaction_date != null && /^\d{4}-\d{2}-\d{2}$/.test(String(req.body.transaction_date).trim())) {
      next.transaction_date = String(req.body.transaction_date).trim();
    }
    if (req.body.description != null) next.description = String(req.body.description).slice(0, 2000);
    if (req.body.category != null) next.category = String(req.body.category).slice(0, 100);
    if (req.body.merchant_name !== undefined) {
      next.merchant_name = req.body.merchant_name ? String(req.body.merchant_name).slice(0, 150) : null;
    }

    const oldDelta = balanceDelta(old.account_type, old.transaction_type, old.amount);
    const newDelta = balanceDelta(old.account_type, next.transaction_type, next.amount);
    const adjust = newDelta - oldDelta;
    if (adjust !== 0) {
      await pool.query('UPDATE bank_accounts SET balance = balance + ? WHERE account_id = ?', [adjust, old.account_id]);
    }

    await pool.query(
      `UPDATE transactions SET
         amount = ?, transaction_type = ?, transaction_date = ?, description = ?, category = ?, merchant_name = ?
       WHERE transaction_id = ?`,
      [
        next.amount,
        next.transaction_type,
        next.transaction_date,
        next.description,
        next.category,
        next.merchant_name,
        txnId,
      ]
    );

    const metrics = await metricsService.calculate(userId);
    void alertMonitorService.runAfterSync(userId, { imported: 1, metrics });
    void transactionInsightNotifications.notifyManualDemoLedgerChange(
      userId,
      `Updated transaction #${txnId}: $${Number(next.amount).toFixed(2)} ${next.transaction_type} on ${next.transaction_date} — ${(next.description || 'no description').slice(0, 120)}${(next.description || '').length > 120 ? '…' : ''}. Metrics refreshed.`
    );
    res.json({ ok: true, metrics_summary: { score: metrics.score } });
  } catch (err) {
    console.error('[ADMIN_SIM] update', err.message);
    res.status(500).json({ error: 'Failed to update transaction' });
  }
};

exports.deleteDemoCustomerTransaction = async (req, res) => {
  const txnId = parseInt(req.params.txnId, 10);
  if (!Number.isFinite(txnId) || txnId <= 0) return res.status(400).json({ error: 'Invalid transaction id' });
  const userId = parseUserId(req.query.user_id);
  if (!(await requireDemoCustomer(userId, res))) return;

  try {
    const [oldRows] = await pool.query(
      `SELECT t.transaction_id, t.account_id, t.amount, t.transaction_type, b.account_type
       FROM transactions t
       INNER JOIN bank_accounts b ON t.account_id = b.account_id
       WHERE t.transaction_id = ? AND b.user_id = ? AND b.plaid_account_id IS NULL AND b.bank_name = ?
       LIMIT 1`,
      [txnId, userId, DEMO_BANK_NAME]
    );
    if (!oldRows.length) {
      return res.status(404).json({ error: 'Not found or not deletable (Plaid-imported txns).' });
    }
    const old = oldRows[0];
    const rev = -balanceDelta(old.account_type, old.transaction_type, old.amount);
    if (rev !== 0) {
      await pool.query('UPDATE bank_accounts SET balance = balance + ? WHERE account_id = ?', [rev, old.account_id]);
    }
    await pool.query('DELETE FROM transactions WHERE transaction_id = ?', [txnId]);
    const metrics = await metricsService.calculate(userId);
    void alertMonitorService.runAfterSync(userId, { imported: 1, metrics });
    void transactionInsightNotifications.notifyManualDemoLedgerChange(
      userId,
      `Removed transaction #${txnId} from your FlowFund Customer Demo ledger. Balance and readiness metrics were recalculated.`
    );
    res.json({ ok: true, metrics_summary: { score: metrics.score } });
  } catch (err) {
    console.error('[ADMIN_SIM] delete', err.message);
    res.status(500).json({ error: 'Failed to delete transaction' });
  }
};
