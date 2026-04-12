const getPlaidClient = require('../config/plaid');
const { Products, CountryCode } = require('plaid');
const { encrypt, decrypt } = require('../utils/encrypt');
const pool = require('../config/db');
const metricsService = require('../services/metricsService');
const { upsertAccountsFromPlaid } = require('../services/plaidAccountSync');
const transactionSyncService = require('../services/transactionSyncService');
const transactionInsightNotifications = require('../services/transactionInsightNotifications');
const alertMonitorService = require('../services/alertMonitorService');
const { toYyyyMmDd } = require('../utils/transactionDate');
const { isCustomerFlowfundUserId } = require('../services/customerFlowfundDemo');

function linkTokenPayload(req) {
  const daysRaw = parseInt(process.env.PLAID_TRANSACTIONS_DAYS_REQUESTED || '90', 10);
  const daysRequested = Number.isFinite(daysRaw) ? Math.min(730, Math.max(30, daysRaw)) : 90;

  return {
    user: { client_user_id: String(req.user.user_id) },
    client_name: 'FlowFund AI',
    products: [Products.Transactions],
    country_codes: [CountryCode.Us],
    language: 'en',
    transactions: { days_requested: daysRequested },
  };
}

// POST /api/plaid/create-link-token
exports.createLinkToken = async (req, res) => {
  try {
    const plaidClient = getPlaidClient();
    const response = await plaidClient.linkTokenCreate(linkTokenPayload(req));
    res.json({ link_token: response.data.link_token });
  } catch (err) {
    const plaidError = err?.response?.data;
    console.error('create-link-token error:', JSON.stringify(plaidError || err.message, null, 2));
    const detail = plaidError ? `[${plaidError.error_code}] ${plaidError.error_message}` : err.message;
    res.status(500).json({ error: 'Failed to create link token', detail });
  }
};

// POST /api/plaid/exchange-public-token
exports.exchangePublicToken = async (req, res) => {
  const { public_token } = req.body;
  if (!public_token) return res.status(400).json({ error: 'public_token is required' });

  try {
    const plaidClient = getPlaidClient();
    const exchangeResponse = await plaidClient.itemPublicTokenExchange({ public_token });
    const { access_token, item_id: plaid_item_id } = exchangeResponse.data;

    const itemResponse = await plaidClient.itemGet({ access_token });
    const institutionId = itemResponse.data.item.institution_id;

    let institution_name = null;
    if (institutionId) {
      const instResponse = await plaidClient.institutionsGetById({
        institution_id: institutionId,
        country_codes: [CountryCode.Us],
      });
      institution_name = instResponse.data.institution.name;
    }

    const access_token_encrypted = encrypt(access_token);

    await pool.query(
      `INSERT INTO plaid_items
         (user_id, plaid_item_id, access_token_encrypted, institution_id, institution_name)
       VALUES (?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
         access_token_encrypted = VALUES(access_token_encrypted),
         institution_id         = VALUES(institution_id),
         institution_name       = VALUES(institution_name)`,
      [req.user.user_id, plaid_item_id, access_token_encrypted, institutionId || null, institution_name]
    );

    const syncResult = await transactionSyncService.syncOneItem({
      userId: req.user.user_id,
      plaidItemId: plaid_item_id,
      accessToken: access_token,
      institutionName: institution_name,
    });
    const metrics = await metricsService.calculate(req.user.user_id);

    const imported = (syncResult.totalAdded || 0) + (syncResult.totalModified || 0);
    void transactionInsightNotifications.runAfterTransactionSync(req.user.user_id, { imported });
    void alertMonitorService.runAfterSync(req.user.user_id, { imported, metrics });

    res.status(201).json({
      message: 'Bank account linked successfully',
      institution_name,
      metrics,
    });
  } catch (err) {
    console.error('exchange-public-token error:', err?.response?.data || err.message);
    res.status(500).json({ error: 'Failed to link bank account' });
  }
};

// GET /api/plaid/accounts
exports.getAccounts = async (req, res) => {
  try {
    const plaidClient = getPlaidClient();
    const [items] = await pool.query(
      'SELECT plaid_item_id, access_token_encrypted, institution_name FROM plaid_items WHERE user_id = ?',
      [req.user.user_id]
    );

    if (items.length === 0) {
      return res.json({ accounts: [] });
    }

    const allAccounts = [];

    for (const item of items) {
      let access_token;
      try {
        access_token = decrypt(item.access_token_encrypted);
      } catch (e) {
        console.error('get-accounts decrypt error:', e.message);
        return res.status(400).json({
          error:
            'Could not read your saved bank link (encryption key may have changed). Disconnect and connect your bank again.',
          code: 'PLAID_TOKEN_DECRYPT',
        });
      }

      const response = await plaidClient.accountsGet({ access_token });
      const plaidAccounts = response.data?.accounts || [];

      await upsertAccountsFromPlaid({
        userId: req.user.user_id,
        plaidItemId: item.plaid_item_id,
        institutionName: item.institution_name,
        accounts: plaidAccounts,
      });

      for (const account of plaidAccounts) {
        const balance = account.balances?.current ?? 0;
        const accountType =
          account.subtype?.toLowerCase() === 'savings'
            ? 'SAVINGS'
            : account.subtype?.toLowerCase().includes('credit')
              ? 'CREDIT'
              : 'CHECKING';

        allAccounts.push({
          plaid_account_id: account.account_id,
          name: account.name,
          official_name: account.official_name || null,
          type: accountType,
          mask: account.mask || null,
          balance,
          institution_name: item.institution_name,
        });
      }
    }

    res.json({ accounts: allAccounts });
  } catch (err) {
    const plaidBody = err?.response?.data;
    console.error('get-accounts error:', plaidBody || err.stack || err.message);
    const detail = plaidBody
      ? `[${plaidBody.error_code || 'plaid'}] ${plaidBody.error_message || JSON.stringify(plaidBody)}`
      : err.message;
    res.status(500).json({ error: 'Failed to fetch accounts', detail });
  }
};

async function fetchRecentTransactionsFromDb(userId, limit = 120) {
  const [rows] = await pool.query(
    `SELECT t.transaction_id,
            t.plaid_transaction_id,
            COALESCE(NULLIF(t.merchant_name, ''), t.description, 'Unknown') AS merchant,
            t.amount, t.transaction_type, t.category,
            t.transaction_date, COALESCE(t.pending, 0) AS pending
     FROM transactions t
     JOIN bank_accounts b ON t.account_id = b.account_id
     WHERE b.user_id = ?
     ORDER BY t.transaction_date DESC, t.transaction_id DESC
     LIMIT ?`,
    [userId, limit]
  );
  return rows;
}

// GET /api/plaid/transactions — full Plaid sync + DB read (backward compatible shape)
exports.getTransactions = async (req, res) => {
  try {
    const { itemsSynced, perItem, metrics } = await transactionSyncService.syncAllItemsForUser(
      req.user.user_id
    );

    const rows = await fetchRecentTransactionsFromDb(req.user.user_id);
    const imported = perItem.reduce((s, p) => s + (p.totalAdded || 0) + (p.totalModified || 0), 0);

    const allTransactions = rows.map((r) => ({
      plaid_transaction_id: r.plaid_transaction_id,
      transaction_id: r.transaction_id,
      merchant: r.merchant,
      amount: parseFloat(r.amount),
      transaction_type: r.transaction_type,
      category: r.category,
      transaction_date: toYyyyMmDd(r.transaction_date) || r.transaction_date,
      pending: Boolean(r.pending),
    }));

    res.json({
      imported,
      itemsSynced,
      perItem,
      transactions: allTransactions,
      metrics,
    });
  } catch (err) {
    console.error('get-transactions error:', err?.response?.data || err.message);
    res.status(500).json({ error: 'Failed to import transactions' });
  }
};

// POST /api/plaid/sync — same as GET /transactions (explicit “pull from Plaid”)
exports.postSync = exports.getTransactions;

// POST /api/plaid/transactions-refresh — Sandbox: ask Plaid for updates, then /transactions/sync
exports.transactionsRefresh = async (req, res) => {
  try {
    const plaidClient = getPlaidClient();
    const [items] = await pool.query(
      'SELECT access_token_encrypted FROM plaid_items WHERE user_id = ?',
      [req.user.user_id]
    );

    if (items.length === 0) {
      return res.status(400).json({ error: 'No linked bank items' });
    }

    const refreshErrors = [];
    for (const item of items) {
      const access_token = decrypt(item.access_token_encrypted);
      try {
        await plaidClient.transactionsRefresh({ access_token });
      } catch (err) {
        const pe = err?.response?.data;
        refreshErrors.push(pe?.error_code || err.message);
        console.error('[PLAID_REFRESH]', pe || err.message);
      }
    }

    const syncResult = await transactionSyncService.syncAllItemsForUser(req.user.user_id, {
      notificationContext: 'explicit_pull',
    });
    const rows = await fetchRecentTransactionsFromDb(req.user.user_id);
    const transactions = rows.map((r) => ({
      ...r,
      amount: parseFloat(r.amount),
      pending: Boolean(r.pending),
      transaction_date: toYyyyMmDd(r.transaction_date) || r.transaction_date,
    }));

    res.json({
      message: 'Transactions refresh + sync complete',
      refresh_errors: refreshErrors,
      ...syncResult,
      transactions,
    });
  } catch (err) {
    console.error('transactions-refresh error:', err?.response?.data || err.message);
    res.status(500).json({ error: 'Failed to refresh transactions' });
  }
};

// DELETE /api/plaid/link — remove stored Plaid item(s), accounts, and their transactions (e.g. after key rotation)
exports.disconnectPlaid = async (req, res) => {
  const uid = req.user.user_id;
  const preserveDemoManual = await isCustomerFlowfundUserId(uid);
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const acctSql = preserveDemoManual
      ? 'SELECT account_id FROM bank_accounts WHERE user_id = ? AND plaid_account_id IS NOT NULL'
      : 'SELECT account_id FROM bank_accounts WHERE user_id = ?';
    const [acctRows] = await conn.query(acctSql, [uid]);
    const ids = acctRows.map((r) => r.account_id);
    if (ids.length) {
      await conn.query('DELETE FROM transactions WHERE account_id IN (?)', [ids]);
    }
    const delAcctSql = preserveDemoManual
      ? 'DELETE FROM bank_accounts WHERE user_id = ? AND plaid_account_id IS NOT NULL'
      : 'DELETE FROM bank_accounts WHERE user_id = ?';
    await conn.query(delAcctSql, [uid]);
    await conn.query('DELETE FROM plaid_items WHERE user_id = ?', [uid]);
    await conn.commit();

    let metrics = null;
    try {
      const [[c]] = await pool.query('SELECT COUNT(*) AS n FROM bank_accounts WHERE user_id = ?', [uid]);
      if ((c?.n || 0) > 0) {
        metrics = await metricsService.calculate(uid);
      }
    } catch (mcErr) {
      console.warn('[PLAID_DISCONNECT] metrics recalc:', mcErr.message);
    }
    try {
      void alertMonitorService.runAfterSync(uid, { imported: 0, metrics });
    } catch (_) {}

    res.json({ ok: true, message: 'Bank link removed. Connect your bank again with the current app settings.' });
  } catch (err) {
    await conn.rollback();
    console.error('disconnect-plaid error:', err.message);
    res.status(500).json({ error: 'Failed to remove bank link' });
  } finally {
    conn.release();
  }
};

// GET /api/plaid/balances
exports.getBalances = async (req, res) => {
  try {
    const plaidClient = getPlaidClient();
    const [items] = await pool.query(
      'SELECT access_token_encrypted, institution_name FROM plaid_items WHERE user_id = ?',
      [req.user.user_id]
    );

    if (items.length === 0) return res.json({ balances: [] });

    const balances = [];

    for (const item of items) {
      let access_token;
      try {
        access_token = decrypt(item.access_token_encrypted);
      } catch (e) {
        return res.status(400).json({
          error:
            'Could not read your saved bank link (encryption key may have changed). Disconnect and connect your bank again.',
          code: 'PLAID_TOKEN_DECRYPT',
        });
      }
      const response = await plaidClient.accountsGet({ access_token });
      const plaidAccounts = response.data?.accounts || [];

      for (const account of plaidAccounts) {
        balances.push({
          name: account.name,
          mask: account.mask,
          institution_name: item.institution_name,
          current: account.balances.current,
          available: account.balances.available,
          currency: account.balances.iso_currency_code,
        });
      }
    }

    res.json({ balances });
  } catch (err) {
    console.error('get-balances error:', err?.response?.data || err.message);
    res.status(500).json({ error: 'Failed to fetch balances' });
  }
};
