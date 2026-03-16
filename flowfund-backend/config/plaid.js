const { Configuration, PlaidApi, PlaidEnvironments } = require('plaid');

let _client = null;

function getPlaidClient() {
  if (_client) return _client;

  const requiredEnvVars = ['PLAID_CLIENT_ID', 'PLAID_SECRET', 'PLAID_ENV'];
  for (const key of requiredEnvVars) {
    if (!process.env[key]) {
      throw new Error(`Missing required environment variable: ${key}`);
    }
  }

  const plaidEnv = process.env.PLAID_ENV;
  if (!PlaidEnvironments[plaidEnv]) {
    throw new Error(
      `Invalid PLAID_ENV value "${plaidEnv}". Must be one of: ${Object.keys(PlaidEnvironments).join(', ')}`
    );
  }

  const configuration = new Configuration({
    basePath: PlaidEnvironments[plaidEnv],
    baseOptions: {
      headers: {
        'PLAID-CLIENT-ID': process.env.PLAID_CLIENT_ID,
        'PLAID-SECRET': process.env.PLAID_SECRET,
      },
    },
  });

  _client = new PlaidApi(configuration);
  return _client;
}

module.exports = getPlaidClient;
