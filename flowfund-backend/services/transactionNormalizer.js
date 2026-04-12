'use strict';

/**
 * Maps a Plaid Transaction (from /transactions/sync) to our DB row shape.
 * Plaid: positive amount = outflow (expense), negative = inflow (income).
 */
function categoryFromPlaid(txn) {
  const pfc = txn.personal_finance_category;
  if (pfc && typeof pfc.primary === 'string' && pfc.primary.length > 0) {
    return pfc.primary.replace(/_/g, ' ');
  }
  if (Array.isArray(txn.category) && txn.category[0]) {
    return txn.category[0];
  }
  return 'Uncategorized';
}

function normalizePlaidTransaction(txn) {
  const amount = Math.abs(txn.amount);
  const transactionType = txn.amount < 0 ? 'INCOME' : 'EXPENSE';
  return {
    plaid_transaction_id: txn.transaction_id,
    plaid_account_id: txn.account_id,
    amount,
    transaction_type: transactionType,
    category: categoryFromPlaid(txn),
    description: txn.name || null,
    merchant_name: txn.merchant_name || null,
    pending: txn.pending ? 1 : 0,
    transaction_date: txn.date,
  };
}

module.exports = { normalizePlaidTransaction, categoryFromPlaid };
