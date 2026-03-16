const getPlaidClient = require('../config/plaid');
const { Products, CountryCode } = require('plaid');

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

// POST /api/plaid/exchange-public-token — implemented in commit 3
exports.exchangePublicToken = (req, res) => {
  res.status(501).json({ error: 'Not implemented yet' });
};

// GET /api/plaid/accounts — implemented in commit 4
exports.getAccounts = (req, res) => {
  res.status(501).json({ error: 'Not implemented yet' });
};

// GET /api/plaid/transactions — implemented in commit 5
exports.getTransactions = (req, res) => {
  res.status(501).json({ error: 'Not implemented yet' });
};

// GET /api/plaid/balances — implemented in commit 5
exports.getBalances = (req, res) => {
  res.status(501).json({ error: 'Not implemented yet' });
};
