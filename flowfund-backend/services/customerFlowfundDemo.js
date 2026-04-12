'use strict';

const pool = require('../config/db');
const metricsService = require('../services/metricsService');

const DEMO_BANK_NAME = 'FlowFund Customer Demo';

function demoEmail() {
  return (process.env.DEMO_CUSTOMER_EMAIL || 'customer_flowfund@flowfund.demo').toLowerCase().trim();
}

function isCustomerFlowfundEmail(email) {
  if (email == null || email === '') return false;
  return String(email).trim().toLowerCase() === demoEmail();
}

async function isCustomerFlowfundUserId(userId) {
  const [rows] = await pool.query('SELECT email FROM users WHERE user_id = ? LIMIT 1', [userId]);
  return rows.length > 0 && isCustomerFlowfundEmail(rows[0].email);
}

/**
 * Pre-seeded demo transactions (amounts positive; INCOME/EXPENSE as stored in DB).
 * Dates applied as "days ago" from seed run.
 */
const SEED_TXNS = [
  { transaction_type: 'INCOME', amount: 3200, category: 'Income', description: 'DIRECT DEP PAYROLL', merchant_name: 'Employer ACH', days_ago: 4 },
  { transaction_type: 'EXPENSE', amount: 89.5, category: 'Food and Drink', description: 'GROCERY STORE', merchant_name: 'Whole Foods', days_ago: 3 },
  { transaction_type: 'EXPENSE', amount: 42.1, category: 'Transportation', description: 'GAS STATION', merchant_name: 'Shell', days_ago: 3 },
  { transaction_type: 'EXPENSE', amount: 18.25, category: 'Food and Drink', description: 'COFFEE SHOP', merchant_name: 'Starbucks', days_ago: 2 },
  { transaction_type: 'EXPENSE', amount: 120, category: 'General Merchandise', description: 'UTILITIES', merchant_name: 'City Electric', days_ago: 6 },
  { transaction_type: 'EXPENSE', amount: 64.99, category: 'Entertainment', description: 'STREAMING', merchant_name: 'Netflix', days_ago: 8 },
  { transaction_type: 'EXPENSE', amount: 55, category: 'Food and Drink', description: 'RESTAURANT', merchant_name: 'Local Bistro', days_ago: 9 },
  { transaction_type: 'INCOME', amount: 150, category: 'Income', description: 'TRANSFER FROM SAVINGS', merchant_name: 'Internal', days_ago: 11 },
  { transaction_type: 'EXPENSE', amount: 210, category: 'General Merchandise', description: 'ONLINE RETAIL', merchant_name: 'Amazon', days_ago: 12 },
  { transaction_type: 'EXPENSE', amount: 35, category: 'Food and Drink', description: 'PHARMACY', merchant_name: 'CVS', days_ago: 14 },
  { transaction_type: 'EXPENSE', amount: 78, category: 'Recreation', description: 'GYM MEMBERSHIP', merchant_name: 'Fitness Club', days_ago: 15 },
  { transaction_type: 'EXPENSE', amount: 22.5, category: 'Food and Drink', description: 'LUNCH', merchant_name: 'Campus Cafe', days_ago: 1 },
];

function dateDaysAgo(daysAgo) {
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  return d.toISOString().slice(0, 10);
}

/**
 * Idempotent: ensures one manual checking account + at least 10 seed transactions.
 */
async function ensureCustomerFlowfundSeed(userId, email) {
  if (!isCustomerFlowfundEmail(email)) return { ok: true, seeded: false };

  const conn = await pool.getConnection();
  let didInsert = false;
  try {
    await conn.beginTransaction();

    const [acctRows] = await conn.query(
      `SELECT account_id FROM bank_accounts
       WHERE user_id = ? AND plaid_account_id IS NULL AND bank_name = ? LIMIT 1`,
      [userId, DEMO_BANK_NAME]
    );

    let accountId;
    if (acctRows.length) {
      accountId = acctRows[0].account_id;
    } else {
      const [ins] = await conn.query(
        `INSERT INTO bank_accounts (user_id, bank_name, account_type, balance, mask)
         VALUES (?, ?, 'CHECKING', 0, '8800')`,
        [userId, DEMO_BANK_NAME]
      );
      accountId = ins.insertId;
      didInsert = true;
    }

    const [[seedCountRow]] = await conn.query(
      `SELECT COUNT(*) AS c FROM transactions t
       WHERE t.account_id = ? AND t.source = 'demo_seed'`,
      [accountId]
    );
    if (seedCountRow.c === 0) {
      for (const row of SEED_TXNS) {
        const td = dateDaysAgo(row.days_ago);
        await conn.query(
          `INSERT INTO transactions
             (account_id, amount, transaction_type, category, description, transaction_date, merchant_name, pending, source)
           VALUES (?, ?, ?, ?, ?, ?, ?, FALSE, 'demo_seed')`,
          [
            accountId,
            row.amount,
            row.transaction_type,
            row.category,
            row.description,
            td,
            row.merchant_name || null,
          ]
        );
      }
      const [[sumRow]] = await conn.query(
        `SELECT
           COALESCE(SUM(CASE WHEN transaction_type = 'INCOME' THEN amount ELSE 0 END), 0) AS inc,
           COALESCE(SUM(CASE WHEN transaction_type = 'EXPENSE' THEN amount ELSE 0 END), 0) AS exp
         FROM transactions WHERE account_id = ?`,
        [accountId]
      );
      const bal = parseFloat(sumRow.inc) - parseFloat(sumRow.exp);
      await conn.query('UPDATE bank_accounts SET balance = ? WHERE account_id = ?', [bal, accountId]);
      didInsert = true;
    }

    await conn.commit();

    if (didInsert) {
      try {
        await metricsService.calculate(userId);
      } catch (e) {
        console.warn('[CUSTOMER_FLOWFUND] metrics after seed:', e.message);
      }
    }

    return { ok: true, seeded: didInsert, accountId };
  } catch (err) {
    await conn.rollback();
    console.error('[CUSTOMER_FLOWFUND] seed error:', err.message);
    throw err;
  } finally {
    conn.release();
  }
}

module.exports = {
  DEMO_BANK_NAME,
  demoEmail,
  isCustomerFlowfundEmail,
  isCustomerFlowfundUserId,
  ensureCustomerFlowfundSeed,
};
