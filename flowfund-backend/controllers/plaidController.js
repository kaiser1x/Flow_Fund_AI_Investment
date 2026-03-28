const getPlaidClient = require('../config/plaid');
const { Products, CountryCode } = require('plaid');
const { encrypt, decrypt } = require('../utils/encrypt');
const pool = require('../config/db');

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

// GET /api/plaid/transactions — implemented in commit 5
exports.getTransactions = (req, res) => {
  res.status(501).json({ error: 'Not implemented yet' });
};

// GET /api/plaid/balances — implemented in commit 5
exports.getBalances = (req, res) => {
  res.status(501).json({ error: 'Not implemented yet' });
};
