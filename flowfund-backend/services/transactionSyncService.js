'use strict';

const getPlaidClient = require('../config/plaid');
const pool = require('../config/db');
const { decrypt } = require('../utils/encrypt');
const metricsService = require('./metricsService');
const transactionInsightNotifications = require('./transactionInsightNotifications');
const alertMonitorService = require('./alertMonitorService');
const { normalizePlaidTransaction } = require('./transactionNormalizer');
const { upsertAccountsFromPlaid, loadAccountMap } = require('./plaidAccountSync');

const MUTATION_ERROR = 'TRANSACTIONS_SYNC_MUTATION_DURING_PAGINATION';

async function loadCursor(plaidItemId) {
  const [rows] = await pool.query(
    'SELECT transactions_sync_cursor FROM plaid_items WHERE plaid_item_id = ? LIMIT 1',
    [plaidItemId]
  );
  if (!rows.length) return null;
  const c = rows[0].transactions_sync_cursor;
  if (c == null || c === '') return null;
  return String(c);
}

async function saveCursor(plaidItemId, cursor) {
  const value = cursor == null || cursor === '' ? null : String(cursor);
  await pool.query('UPDATE plaid_items SET transactions_sync_cursor = ? WHERE plaid_item_id = ?', [
    value,
    plaidItemId,
  ]);
}

async function upsertTransactionRow(accountMap, row) {
  const accountId = accountMap[row.plaid_account_id];
  if (!accountId) return false;

  await pool.query(
    `INSERT INTO transactions
       (account_id, amount, transaction_type, category, description,
        transaction_date, plaid_transaction_id, merchant_name, pending, source)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'plaid')
     ON DUPLICATE KEY UPDATE
       account_id       = VALUES(account_id),
       amount           = VALUES(amount),
       transaction_type = VALUES(transaction_type),
       category         = VALUES(category),
       description      = VALUES(description),
       transaction_date = VALUES(transaction_date),
       merchant_name    = VALUES(merchant_name),
       pending          = VALUES(pending)`,
    [
      accountId,
      row.amount,
      row.transaction_type,
      row.category,
      row.description,
      row.transaction_date,
      row.plaid_transaction_id,
      row.merchant_name,
      row.pending,
    ]
  );
  return true;
}

async function removeByPlaidTransactionId(plaidTransactionId) {
  await pool.query('DELETE FROM transactions WHERE plaid_transaction_id = ?', [plaidTransactionId]);
}

/**
 * Run /transactions/sync for one Item until has_more is false; apply added/modified/removed.
 * Returns counts and update status from the last page.
 */
async function syncOneItem({ userId, plaidItemId, accessToken, institutionName }) {
  const plaidClient = getPlaidClient();

  const accountsResponse = await plaidClient.accountsGet({ access_token: accessToken });
  await upsertAccountsFromPlaid({
    userId,
    plaidItemId,
    institutionName,
    accounts: accountsResponse.data.accounts,
  });

  let cursor = await loadCursor(plaidItemId);
  let totalAdded = 0;
  let totalModified = 0;
  let totalRemoved = 0;
  let lastStatus = null;

  // Paginate; on TRANSACTIONS_SYNC_MUTATION_DURING_PAGINATION retry the same cursor.
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const cursorAtPageStart = cursor;

    let data;
    try {
      const response = await plaidClient.transactionsSync({
        access_token: accessToken,
        ...(cursor ? { cursor } : {}),
      });
      data = response.data;
    } catch (err) {
      const code = err?.response?.data?.error_code;
      if (code === MUTATION_ERROR) {
        cursor = cursorAtPageStart;
        continue;
      }
      throw err;
    }

    lastStatus = data.transactions_update_status;
    let accountMap = await loadAccountMap(userId);

    for (const txn of data.added || []) {
      const row = normalizePlaidTransaction(txn);
      if (await upsertTransactionRow(accountMap, row)) totalAdded += 1;
    }
    for (const txn of data.modified || []) {
      const row = normalizePlaidTransaction(txn);
      if (await upsertTransactionRow(accountMap, row)) totalModified += 1;
    }
    for (const r of data.removed || []) {
      await removeByPlaidTransactionId(r.transaction_id);
      totalRemoved += 1;
    }

    const next = data.next_cursor;
    if (next != null && String(next).length > 0) {
      await saveCursor(plaidItemId, next);
      cursor = next;
    }

    if (!data.has_more) break;
    if (!cursor) break; // avoid infinite loop if Plaid omits next_cursor while has_more
  }

  return {
    totalAdded,
    totalModified,
    totalRemoved,
    transactions_update_status: lastStatus,
  };
}

/**
 * Sync all Plaid items for a user, then recompute financial_metrics + investment_scores.
 * @param {number} userId
 * @param {{ notificationContext?: 'explicit_pull' }} [options] — explicit_pull: user/admin clicked refresh/sync (notify even if 0 churn)
 */
async function syncAllItemsForUser(userId, options = {}) {
  const [items] = await pool.query(
    'SELECT plaid_item_id, access_token_encrypted, institution_name FROM plaid_items WHERE user_id = ?',
    [userId]
  );

  const perItem = [];
  for (const item of items) {
    const accessToken = decrypt(item.access_token_encrypted);
    const result = await syncOneItem({
      userId,
      plaidItemId: item.plaid_item_id,
      accessToken,
      institutionName: item.institution_name,
    });
    perItem.push({ plaid_item_id: item.plaid_item_id, ...result });
  }

  let metrics = null;
  if (items.length > 0) {
    metrics = await metricsService.calculate(userId);
  } else {
    const [[row]] = await pool.query('SELECT COUNT(*) AS n FROM bank_accounts WHERE user_id = ?', [userId]);
    if ((row?.n || 0) > 0) {
      metrics = await metricsService.calculate(userId);
    }
  }

  const imported = perItem.reduce((s, p) => s + (p.totalAdded || 0) + (p.totalModified || 0), 0);
  const removed = perItem.reduce((s, p) => s + (p.totalRemoved || 0), 0);
  void transactionInsightNotifications.runAfterTransactionSync(userId, {
    imported,
    removed,
    notificationContext: options.notificationContext,
  });
  void alertMonitorService.runAfterSync(userId, { imported, metrics });

  return { itemsSynced: items.length, perItem, metrics };
}

module.exports = {
  syncOneItem,
  syncAllItemsForUser,
};
