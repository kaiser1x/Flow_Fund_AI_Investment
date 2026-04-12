const { buildSnapshot } = require('../services/snapshotService');
const pool = require('../config/db');
const { toYyyyMmDd } = require('../utils/transactionDate');
const { isCustomerFlowfundEmail } = require('../services/customerFlowfundDemo');

/** Manual demo checking row for customer_flowfund — merged on dashboard with Plaid accounts. */
exports.getDemoCustomerAccounts = async (req, res) => {
  try {
    const [users] = await pool.query('SELECT email FROM users WHERE user_id = ? LIMIT 1', [req.user.user_id]);
    if (!users.length || !isCustomerFlowfundEmail(users[0].email)) {
      return res.json({ accounts: [] });
    }
    const [rows] = await pool.query(
      `SELECT account_id, bank_name, account_type, balance, mask
       FROM bank_accounts
       WHERE user_id = ? AND plaid_account_id IS NULL
       ORDER BY account_id`,
      [req.user.user_id]
    );
    const accounts = rows.map((r) => ({
      plaid_account_id: `manual-${r.account_id}`,
      name: r.bank_name,
      official_name: null,
      type: r.account_type,
      mask: r.mask || null,
      balance: parseFloat(r.balance) || 0,
      institution_name: r.bank_name,
    }));
    res.json({ accounts });
  } catch (err) {
    console.error('demo-customer-accounts error:', err.message);
    res.status(500).json({ error: 'Failed to load demo accounts' });
  }
};

// GET /api/financial/snapshot
exports.getSnapshot = async (req, res) => {
  try {
    const snapshot = await buildSnapshot(req.user.user_id);
    res.json(snapshot);
  } catch (err) {
    console.error('snapshot error:', err.message);
    res.status(500).json({ error: 'Failed to build financial snapshot' });
  }
};

// GET /api/financial/transactions
exports.getTransactions = async (req, res) => {
  try {
    let rows = [];
    try {
      [rows] = await pool.query(
        `SELECT t.transaction_id,
                COALESCE(NULLIF(t.merchant_name, ''), t.description, 'Unknown') AS merchant,
                t.amount, t.transaction_type, t.category,
                t.transaction_date, COALESCE(t.pending, 0) AS pending
         FROM transactions t
         JOIN bank_accounts b ON t.account_id = b.account_id
         WHERE b.user_id = ?
         ORDER BY t.transaction_date DESC, t.transaction_id DESC
         LIMIT 60`,
        [req.user.user_id]
      );
    } catch (_) {
      // merchant_name may not exist on this DB yet — fall back to description
      try {
        [rows] = await pool.query(
          `SELECT t.transaction_id,
                  COALESCE(t.description, 'Unknown') AS merchant,
                  t.amount, t.transaction_type, t.category,
                  t.transaction_date, 0 AS pending
           FROM transactions t
           JOIN bank_accounts b ON t.account_id = b.account_id
           WHERE b.user_id = ?
           ORDER BY t.transaction_date DESC, t.transaction_id DESC
           LIMIT 60`,
          [req.user.user_id]
        );
      } catch (_) {
        rows = [];
      }
    }

    if (rows.length === 0) {
      return res.json({ transactions: [], isDemo: false });
    }

    const transactions = rows.map((r) => ({
      ...r,
      transaction_date: toYyyyMmDd(r.transaction_date) || r.transaction_date,
    }));
    res.json({ transactions, isDemo: false });
  } catch (err) {
    console.error('transactions error:', err.message);
    res.status(500).json({ error: 'Failed to fetch transactions' });
  }
};
