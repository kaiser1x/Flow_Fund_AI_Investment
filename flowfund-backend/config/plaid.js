const { Configuration, PlaidApi, PlaidEnvironments } = require('plaid');

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

const plaidClient = new PlaidApi(configuration);

module.exports = plaidClient;
