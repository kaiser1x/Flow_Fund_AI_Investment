const getPlaidClient = require('../config/plaid');
const { Products, CountryCode } = require('plaid');
const { encrypt, decrypt } = require('../utils/encrypt');
const pool = require('../config/db');
const metricsService = require('../services/metricsService');

// POST /api/plaid/create-link-token
exports.createLinkToken = async (req, res) => {
  try {
    const plaidClient = getPlaidClient();
    const response = await plaidClient.linkTokenCreate({
      user: { client_user_id: String(req.user.user_id) },
      client_name: 'FlowFund AI',
      products: [Products.Transactions],
      country_codes: [CountryCode.Us],
      language: 'en',
    });

    res.json({ link_token: response.data.link_token });
  } catch (err) {
    console.error('create-link-token error:', err?.response?.data || err.message);
    res.status(500).json({ error: 'Failed to create link token' });
  }
};

// POST /api/plaid/exchange-public-token
exports.exchangePublicToken = async (req, res) => {
  const { public_token } = req.body;
  if (!public_token) return res.status(400).json({ error: 'public_token is required' });

  try {
    const plaidClient = getPlaidClient();

    // Exchange public_token for access_token + plaid_item_id
    const exchangeResponse = await plaidClient.itemPublicTokenExchange({ public_token });
    const { access_token, item_id: plaid_item_id } = exchangeResponse.data;

    // Fetch institution metadata to label the linked item
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

    // Encrypt the access_token — never stored in plaintext
    const access_token_encrypted = encrypt(access_token);

    // Persist the item; re-link updates the token without creating duplicates
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

    res.status(201).json({
      message: 'Bank account linked successfully',
      institution_name,
    });
  } catch (err) {
    console.error('exchange-public-token error:', err?.response?.data || err.message);
    res.status(500).json({ error: 'Failed to link bank account' });
  }
};

// Normalize Plaid account subtype to our ENUM values
function normalizeAccountType(plaidSubtype) {
  if (!plaidSubtype) return 'CHECKING';
  const s = plaidSubtype.toLowerCase();
  if (s === 'savings') return 'SAVINGS';
  if (s.includes('credit')) return 'CREDIT';
  return 'CHECKING';
}

// GET /api/plaid/accounts
exports.getAccounts = async (req, res) => {
  try {
    const plaidClient = getPlaidClient();

    // Load all linked items for this user
    const [items] = await pool.query(
      'SELECT plaid_item_id, access_token_encrypted, institution_name FROM plaid_items WHERE user_id = ?',
      [req.user.user_id]
    );

    if (items.length === 0) {
      return res.json({ accounts: [] });
    }

    const allAccounts = [];

    for (const item of items) {
      const access_token = decrypt(item.access_token_encrypted);
      const response = await plaidClient.accountsGet({ access_token });

      for (const account of response.data.accounts) {
        const accountType = normalizeAccountType(account.subtype);
        const balance = account.balances.current ?? 0;

        // Upsert into bank_accounts — re-fetch never duplicates
        await pool.query(
          `INSERT INTO bank_accounts
             (user_id, bank_name, account_type, balance, plaid_account_id, plaid_item_id, mask)
           VALUES (?, ?, ?, ?, ?, ?, ?)
           ON DUPLICATE KEY UPDATE
             bank_name    = VALUES(bank_name),
             account_type = VALUES(account_type),
             balance      = VALUES(balance),
             mask         = VALUES(mask)`,
          [
            req.user.user_id,
            item.institution_name || account.name,
            accountType,
            balance,
            account.account_id,
            item.plaid_item_id,
            account.mask || null,
          ]
        );

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
    console.error('get-accounts error:', err?.response?.data || err.message);
    res.status(500).json({ error: 'Failed to fetch accounts' });
  }
};

// GET /api/plaid/transactions
exports.getTransactions = async (req, res) => {
  try {
    const plaidClient = getPlaidClient();

    const [items] = await pool.query(
      'SELECT plaid_item_id, access_token_encrypted FROM plaid_items WHERE user_id = ?',
      [req.user.user_id]
    );

    if (items.length === 0) return res.json({ imported: 0, transactions: [] });

    // Fetch account_id map: plaid_account_id -> our bank_accounts.account_id
    const [bankAccounts] = await pool.query(
      'SELECT account_id, plaid_account_id FROM bank_accounts WHERE user_id = ?',
      [req.user.user_id]
    );
    const accountMap = {};
    for (const row of bankAccounts) {
      accountMap[row.plaid_account_id] = row.account_id;
    }

    const endDate   = new Date().toISOString().slice(0, 10);
    const startDate = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

    let totalImported = 0;
    const allTransactions = [];

    for (const item of items) {
      const access_token = decrypt(item.access_token_encrypted);
      const response = await plaidClient.transactionsGet({
        access_token,
        start_date: startDate,
        end_date: endDate,
      });

      for (const txn of response.data.transactions) {
        const accountId = accountMap[txn.account_id];
        if (!accountId) continue; // account not yet synced — skip

        // Plaid: positive amount = money leaving account (expense), negative = money coming in (income)
        const amount          = Math.abs(txn.amount);
        const transactionType = txn.amount < 0 ? 'INCOME' : 'EXPENSE';
        const category        = txn.category?.[0] || 'Uncategorized';
        const description     = txn.name || null;
        const transactionDate = txn.date;

        await pool.query(
          `INSERT INTO transactions
             (account_id, amount, transaction_type, category, description, transaction_date, plaid_transaction_id)
           VALUES (?, ?, ?, ?, ?, ?, ?)
           ON DUPLICATE KEY UPDATE
             amount           = VALUES(amount),
             transaction_type = VALUES(transaction_type),
             category         = VALUES(category),
             description      = VALUES(description),
             transaction_date = VALUES(transaction_date)`,
          [accountId, amount, transactionType, category, description, transactionDate, txn.transaction_id]
        );

        totalImported++;
        allTransactions.push({
          plaid_transaction_id: txn.transaction_id,
          account_id: accountId,
          amount,
          transaction_type: transactionType,
          category,
          description,
          transaction_date: transactionDate,
        });
      }
    }

    // Recalculate financial metrics and investment readiness after import
    const metrics = await metricsService.calculate(req.user.user_id);

    res.json({ imported: totalImported, transactions: allTransactions, metrics });
  } catch (err) {
    console.error('get-transactions error:', err?.response?.data || err.message);
    res.status(500).json({ error: 'Failed to import transactions' });
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
      const access_token = decrypt(item.access_token_encrypted);
      const response = await plaidClient.accountsGet({ access_token });

      for (const account of response.data.accounts) {
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
