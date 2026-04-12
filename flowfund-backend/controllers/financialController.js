const { buildSnapshot } = require('../services/snapshotService');
const { buildHistorical } = require('../services/historicalService');
const pool = require('../config/db');

function getDemoTransactions() {
  const now = new Date();
  const ago = (days) => {
    const d = new Date(now);
    d.setDate(d.getDate() - days);
    return d.toISOString().slice(0, 10);
  };
  return [
    { merchant: 'Starbucks',        amount:    6.45, transaction_type: 'EXPENSE', category: 'Food & Drink',     transaction_date: ago(0)  },
    { merchant: 'Uber Eats',        amount:   24.50, transaction_type: 'EXPENSE', category: 'Food & Drink',     transaction_date: ago(0)  },
    { merchant: 'Amazon',           amount:   48.20, transaction_type: 'EXPENSE', category: 'Shopping',         transaction_date: ago(1)  },
    { merchant: 'Netflix',          amount:   15.49, transaction_type: 'EXPENSE', category: 'Entertainment',    transaction_date: ago(1)  },
    { merchant: 'Uber',             amount:   13.10, transaction_type: 'EXPENSE', category: 'Transportation',   transaction_date: ago(2)  },
    { merchant: 'Walmart',          amount:   67.30, transaction_type: 'EXPENSE', category: 'Groceries',        transaction_date: ago(2)  },
    { merchant: 'Spotify',          amount:    9.99, transaction_type: 'EXPENSE', category: 'Entertainment',    transaction_date: ago(3)  },
    { merchant: 'Target',           amount:   42.15, transaction_type: 'EXPENSE', category: 'Shopping',         transaction_date: ago(4)  },
    { merchant: 'Chipotle',         amount:   12.80, transaction_type: 'EXPENSE', category: 'Food & Drink',     transaction_date: ago(4)  },
    { merchant: 'Shell Gas',        amount:   45.00, transaction_type: 'EXPENSE', category: 'Transportation',   transaction_date: ago(5)  },
    { merchant: 'Direct Deposit',   amount: 1200.00, transaction_type: 'INCOME',  category: 'Income',           transaction_date: ago(5)  },
    { merchant: "McDonald's",       amount:    8.75, transaction_type: 'EXPENSE', category: 'Food & Drink',     transaction_date: ago(6)  },
    { merchant: 'Apple Music',      amount:   10.99, transaction_type: 'EXPENSE', category: 'Entertainment',    transaction_date: ago(7)  },
    { merchant: 'Instacart',        amount:   53.20, transaction_type: 'EXPENSE', category: 'Groceries',        transaction_date: ago(8)  },
    { merchant: 'Lyft',             amount:   18.40, transaction_type: 'EXPENSE', category: 'Transportation',   transaction_date: ago(9)  },
    { merchant: 'Hulu',             amount:    7.99, transaction_type: 'EXPENSE', category: 'Entertainment',    transaction_date: ago(10) },
    { merchant: "Dunkin'",          amount:    5.25, transaction_type: 'EXPENSE', category: 'Food & Drink',     transaction_date: ago(11) },
    { merchant: 'Gym Membership',   amount:   29.99, transaction_type: 'EXPENSE', category: 'Health & Fitness', transaction_date: ago(14) },
    { merchant: 'Textbooks Online', amount:   89.00, transaction_type: 'EXPENSE', category: 'Education',        transaction_date: ago(16) },
    { merchant: 'Direct Deposit',   amount: 1200.00, transaction_type: 'INCOME',  category: 'Income',           transaction_date: ago(20) },
  ];
}

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
      return res.json({ transactions: getDemoTransactions(), isDemo: true });
    }
    res.json({ transactions: rows, isDemo: false });
  } catch (err) {
    console.error('transactions error:', err.message);
    res.status(500).json({ error: 'Failed to fetch transactions' });
  }
};

// GET /api/financial/historical
exports.getHistorical = async (req, res) => {
  try {
    const result = await buildHistorical(req.user.user_id, req.query);
    res.json(result);
  } catch (err) {
    if (err.statusCode === 400) {
      return res.status(400).json({ error: err.message });
    }
    console.error('historical analysis error:', err.message);
    res.status(500).json({ error: 'Failed to build historical analysis' });
  }
};
