'use strict';

const pool = require('../config/db');

function normalizeAccountType(plaidSubtype) {
  if (!plaidSubtype) return 'CHECKING';
  const s = plaidSubtype.toLowerCase();
  if (s === 'savings') return 'SAVINGS';
  if (s.includes('credit')) return 'CREDIT';
  return 'CHECKING';
}

/**
 * Upsert all depository accounts for one Plaid Item into bank_accounts.
 */
function clampStr(s, maxLen) {
  if (s == null || s === '') return null;
  const t = String(s);
  return t.length <= maxLen ? t : t.slice(0, maxLen);
}

function safeBalance(v) {
  const n = Number(v);
  if (!Number.isFinite(n)) return 0;
  return Math.round(n * 100) / 100;
}

async function upsertAccountsFromPlaid({ userId, plaidItemId, institutionName, accounts }) {
  const list = Array.isArray(accounts) ? accounts : [];
  for (const account of list) {
    if (!account?.account_id) continue;
    const accountType = normalizeAccountType(account.subtype);
    const balance = safeBalance(account.balances?.current ?? account.balances?.available ?? 0);
    const bankName = clampStr(institutionName || account.name || account.official_name, 150);
    const mask = clampStr(account.mask, 32);
    await pool.query(
      `INSERT INTO bank_accounts
         (user_id, bank_name, account_type, balance, plaid_account_id, plaid_item_id, mask)
       VALUES (?, ?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
         bank_name    = VALUES(bank_name),
         account_type = VALUES(account_type),
         balance      = VALUES(balance),
         mask         = VALUES(mask),
         plaid_item_id = VALUES(plaid_item_id)`,
      [userId, bankName, accountType, balance, account.account_id, plaidItemId, mask]
    );
  }
}

async function loadAccountMap(userId) {
  const [bankAccounts] = await pool.query(
    'SELECT account_id, plaid_account_id FROM bank_accounts WHERE user_id = ?',
    [userId]
  );
  const accountMap = {};
  for (const row of bankAccounts) {
    if (row.plaid_account_id != null && row.plaid_account_id !== '') {
      accountMap[row.plaid_account_id] = row.account_id;
    }
  }
  return accountMap;
}

module.exports = { upsertAccountsFromPlaid, loadAccountMap, normalizeAccountType };
