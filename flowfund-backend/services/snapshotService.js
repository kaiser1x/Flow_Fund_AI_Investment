const pool = require('../config/db');
const { isCustomerFlowfundUserId } = require('./customerFlowfundDemo');

/**
 * Builds a structured financial snapshot for a user from their stored
 * transaction and account data. This snapshot is used as context for the
 * Gemini chatbot — all numbers are backend-computed, never invented by AI.
 */
async function buildSnapshot(user_id) {
  const now = new Date();
  const d30  = fmtDate(new Date(now - 30 * 86400000));
  const d60  = fmtDate(new Date(now - 60 * 86400000));
  const d90  = fmtDate(new Date(now - 90 * 86400000));
  const today = fmtDate(now);

  // ── Linked Plaid item(s) and/or customer_flowfund manual demo account ────
  const [itemRows] = await pool.query(
    'SELECT COUNT(*) AS cnt FROM plaid_items WHERE user_id = ?',
    [user_id]
  );
  let hasLinkedAccounts = itemRows[0].cnt > 0;

  if (!hasLinkedAccounts) {
    const demo = await isCustomerFlowfundUserId(user_id);
    if (demo) {
      const [acctRows] = await pool.query(
        'SELECT COUNT(*) AS cnt FROM bank_accounts WHERE user_id = ?',
        [user_id]
      );
      hasLinkedAccounts = acctRows[0].cnt > 0;
    }
  }

  if (!hasLinkedAccounts) {
    console.log(`[SNAPSHOT_GATE] user_id=${user_id} no linked accounts → no data`);
    return { hasData: false, reason: 'No linked bank accounts found.' };
  }

  // ── Check for actual transaction data ────────────────────────────────────
  // Guard: even if accounts are linked, treat as no-data if no transactions
  // exist yet (e.g. Plaid import pending / failed). Matches the dashboard,
  // which shows an empty feed until transactions exist for this user.
  const [txnCountRows] = await pool.query(
    `SELECT COUNT(*) AS cnt
     FROM transactions t
     JOIN bank_accounts b ON t.account_id = b.account_id
     WHERE b.user_id = ?
       AND t.transaction_date >= ?`,
    [user_id, d90]
  );
  const hasTransactions = txnCountRows[0].cnt > 0;
  console.log(`[SNAPSHOT_GATE] user_id=${user_id} hasLinkedAccounts=true txnCount=${txnCountRows[0].cnt} hasTransactions=${hasTransactions}`);

  if (!hasTransactions) {
    return { hasData: false, reason: 'No transactions found in the last 90 days.' };
  }

  // ── Account summary ─────────────────────────────────────────────────────
  const [accountRows] = await pool.query(
    `SELECT COUNT(*) AS cnt, COALESCE(SUM(balance), 0) AS total_balance
     FROM bank_accounts WHERE user_id = ?`,
    [user_id]
  );
  const accountCount       = accountRows[0].cnt;
  const totalCurrentBalance = parseFloat(accountRows[0].total_balance) || 0;

  // ── Spending totals ─────────────────────────────────────────────────────
  const spend30  = await sumExpenses(user_id, d30,  today);
  const spend90  = await sumExpenses(user_id, d90,  today);
  const priorSpend30 = await sumExpenses(user_id, d60, d30);
  const avgMonthlySpend = spend90 > 0 ? spend90 / 3 : 0;
  console.log(`[SNAPSHOT_SPENDING] user_id=${user_id} source=db dateRange=${d30}→${today} spend30=${spend30} spend90=${spend90}`);

  // ── Top categories (90d) ────────────────────────────────────────────────
  const [catRows] = await pool.query(
    `SELECT t.category, COALESCE(SUM(t.amount), 0) AS total
     FROM transactions t
     JOIN bank_accounts b ON t.account_id = b.account_id
     WHERE b.user_id = ?
       AND t.transaction_type = 'EXPENSE'
       AND t.transaction_date >= ?
     GROUP BY t.category
     ORDER BY total DESC
     LIMIT 5`,
    [user_id, d90]
  );
  const topCategories = catRows.map(r => ({
    category: r.category || 'Uncategorized',
    amount: parseFloat(r.total),
  }));

  // ── Top merchants (90d) ─────────────────────────────────────────────────
  let topMerchants = [];
  try {
    const [merchantRows] = await pool.query(
      `SELECT
         COALESCE(NULLIF(merchant_name, ''), description) AS merchant,
         COALESCE(SUM(amount), 0) AS total
       FROM transactions t
       JOIN bank_accounts b ON t.account_id = b.account_id
       WHERE b.user_id = ?
         AND t.transaction_type = 'EXPENSE'
         AND t.transaction_date >= ?
         AND COALESCE(NULLIF(merchant_name, ''), description) IS NOT NULL
       GROUP BY merchant
       ORDER BY total DESC
       LIMIT 5`,
      [user_id, d90]
    );
    topMerchants = merchantRows.map(r => ({
      merchant: r.merchant,
      amount: parseFloat(r.total),
    }));
  } catch (_) {
    // merchant_name column may not exist yet — fall back to description only
    const [merchantRows] = await pool.query(
      `SELECT description AS merchant, COALESCE(SUM(amount), 0) AS total
       FROM transactions t
       JOIN bank_accounts b ON t.account_id = b.account_id
       WHERE b.user_id = ? AND t.transaction_type = 'EXPENSE'
         AND t.transaction_date >= ? AND description IS NOT NULL
       GROUP BY description ORDER BY total DESC LIMIT 5`,
      [user_id, d90]
    );
    topMerchants = merchantRows.map(r => ({
      merchant: r.merchant,
      amount: parseFloat(r.total),
    }));
  }

  // ── Recurring charges (same merchant appearing 2+ months in 90d window) ─
  let recurringCharges = [];
  try {
    const [recurRows] = await pool.query(
      `SELECT
         COALESCE(NULLIF(merchant_name, ''), description) AS merchant,
         COUNT(DISTINCT DATE_FORMAT(transaction_date, '%Y-%m')) AS month_count,
         AVG(amount) AS avg_amount
       FROM transactions t
       JOIN bank_accounts b ON t.account_id = b.account_id
       WHERE b.user_id = ?
         AND t.transaction_type = 'EXPENSE'
         AND t.transaction_date >= ?
         AND COALESCE(NULLIF(merchant_name, ''), description) IS NOT NULL
       GROUP BY merchant
       HAVING month_count >= 2
       ORDER BY avg_amount DESC
       LIMIT 8`,
      [user_id, d90]
    );
    recurringCharges = recurRows.map(r => ({
      merchant: r.merchant,
      amount: parseFloat(r.avg_amount).toFixed(2),
      frequency: 'monthly',
    }));
  } catch (_) {
    // merchant_name column may not exist yet — skip recurring detection
  }

  // ── Spending spikes (last 30d vs prior 30d by category) ─────────────────
  const [spikeRows] = await pool.query(
    `SELECT
       t.category,
       SUM(CASE WHEN t.transaction_date >= ? THEN t.amount ELSE 0 END) AS recent,
       SUM(CASE WHEN t.transaction_date < ? AND t.transaction_date >= ? THEN t.amount ELSE 0 END) AS prior
     FROM transactions t
     JOIN bank_accounts b ON t.account_id = b.account_id
     WHERE b.user_id = ?
       AND t.transaction_type = 'EXPENSE'
       AND t.transaction_date >= ?
     GROUP BY t.category
     HAVING prior > 0 AND recent > prior * 1.25`,
    [d30, d30, d60, user_id, d60]
  );
  const spendingSpikes = spikeRows.map(r => ({
    category: r.category || 'Uncategorized',
    changePct: parseFloat((((r.recent - r.prior) / r.prior) * 100).toFixed(1)),
  }));

  // ── Income estimate (30d) ────────────────────────────────────────────────
  const [incomeRows] = await pool.query(
    `SELECT COALESCE(SUM(t.amount), 0) AS total
     FROM transactions t
     JOIN bank_accounts b ON t.account_id = b.account_id
     WHERE b.user_id = ?
       AND t.transaction_type = 'INCOME'
       AND t.transaction_date >= ?`,
    [user_id, d30]
  );
  const estimatedMonthlyIncome = parseFloat(incomeRows[0].total) || 0;

  const estimatedSavingsRate =
    estimatedMonthlyIncome > 0
      ? Math.max(0, (estimatedMonthlyIncome - spend30) / estimatedMonthlyIncome)
      : null;

  const cashBufferMonths =
    avgMonthlySpend > 0 ? totalCurrentBalance / avgMonthlySpend : null;

  // ── Risk flags ───────────────────────────────────────────────────────────
  const riskFlags = [];

  if (cashBufferMonths !== null && cashBufferMonths < 1) {
    riskFlags.push('Low cash buffer — less than 1 month of expenses covered');
  }
  if (recurringCharges.length >= 5) {
    riskFlags.push('High subscription load — multiple recurring charges detected');
  }
  if (spend30 > priorSpend30 * 1.2 && priorSpend30 > 0) {
    riskFlags.push('Spending growth detected — last 30 days up 20%+ vs prior period');
  }
  if (estimatedSavingsRate !== null && estimatedSavingsRate < 0.05) {
    riskFlags.push('Low savings rate — less than 5% of income being retained');
  }

  const foodCat = topCategories.find(c =>
    c.category.toLowerCase().includes('food') ||
    c.category.toLowerCase().includes('restaurant')
  );
  if (foodCat && spend30 > 0 && foodCat.amount / spend90 > 0.35) {
    riskFlags.push('High discretionary food spending — over 35% of expenses');
  }

  // ── Recommended focus areas ─────────────────────────────────────────────
  const recommendedFocusAreas = [];

  if (recurringCharges.length > 0) {
    recommendedFocusAreas.push('Review and reduce recurring subscriptions');
  }
  if (cashBufferMonths !== null && cashBufferMonths < 3) {
    recommendedFocusAreas.push('Build emergency fund to cover 3 months of expenses');
  }
  if (estimatedSavingsRate !== null && estimatedSavingsRate < 0.15) {
    recommendedFocusAreas.push('Increase monthly savings rate toward 15%+');
  }
  if (spendingSpikes.length > 0) {
    recommendedFocusAreas.push(`Investigate spending spike in: ${spendingSpikes.map(s => s.category).join(', ')}`);
  }
  if (topCategories[0]?.category.toLowerCase().includes('food')) {
    recommendedFocusAreas.push('Reduce takeout and dining frequency');
  }
  if (recommendedFocusAreas.length === 0) {
    recommendedFocusAreas.push('Maintain current spending discipline and track monthly progress');
  }

  return {
    hasData: true,
    userProfile: { userId: user_id, timeRange: '90d' },
    accountsSummary: { accountCount, totalCurrentBalance },
    spendingSummary: {
      last30Days: spend30,
      last90Days: spend90,
      averageMonthlySpend: parseFloat(avgMonthlySpend.toFixed(2)),
      topCategories,
      topMerchants,
      recurringCharges,
      spendingSpikes,
    },
    incomeSummary: {
      estimatedMonthlyIncome,
      estimatedSavingsRate:
        estimatedSavingsRate !== null
          ? parseFloat(estimatedSavingsRate.toFixed(2))
          : null,
      cashBufferMonths:
        cashBufferMonths !== null ? parseFloat(cashBufferMonths.toFixed(1)) : null,
    },
    riskFlags,
    recommendedFocusAreas,
  };
}

function fmtDate(d) {
  return d.toISOString().slice(0, 10);
}

async function sumExpenses(user_id, from, to) {
  const [rows] = await pool.query(
    `SELECT COALESCE(SUM(t.amount), 0) AS total
     FROM transactions t
     JOIN bank_accounts b ON t.account_id = b.account_id
     WHERE b.user_id = ?
       AND t.transaction_type = 'EXPENSE'
       AND t.transaction_date >= ?
       AND t.transaction_date <= ?`,
    [user_id, from, to]
  );
  return parseFloat(rows[0].total) || 0;
}

function buildDemoSnapshot() {
  return {
    hasData: true,
    isDemo: true,
    userProfile: { timeRange: '90d' },
    accountsSummary: { accountCount: 1, totalCurrentBalance: 1247.82 },
    spendingSummary: {
      last30Days: 508.55,
      last90Days: 1525.65,
      averageMonthlySpend: 508.55,
      topCategories: [
        { category: 'Food & Drink', amount: 57.75 },
        { category: 'Groceries', amount: 120.50 },
        { category: 'Shopping', amount: 90.35 },
        { category: 'Transportation', amount: 76.50 },
        { category: 'Entertainment', amount: 44.46 },
      ],
      topMerchants: [
        { merchant: 'Walmart', amount: 67.30 },
        { merchant: 'Instacart', amount: 53.20 },
        { merchant: 'Amazon', amount: 48.20 },
        { merchant: 'Shell Gas', amount: 45.00 },
        { merchant: 'Target', amount: 42.15 },
      ],
      recurringCharges: [
        { merchant: 'Netflix', amount: '15.49', frequency: 'monthly' },
        { merchant: 'Spotify', amount: '9.99', frequency: 'monthly' },
        { merchant: 'Hulu', amount: '7.99', frequency: 'monthly' },
        { merchant: 'Apple Music', amount: '10.99', frequency: 'monthly' },
        { merchant: 'Gym Membership', amount: '29.99', frequency: 'monthly' },
      ],
      spendingSpikes: [{ category: 'Food & Drink', changePct: 28.5 }],
    },
    incomeSummary: {
      estimatedMonthlyIncome: 1200.00,
      estimatedSavingsRate: 0.58,
      cashBufferMonths: 2.45,
    },
    riskFlags: [
      'High subscription load — 5 recurring charges ($64.45/month)',
      'High discretionary food spending — top spend category',
    ],
    recommendedFocusAreas: [
      'Review and reduce recurring subscriptions ($64.45/month)',
      'Build emergency fund to cover 3 months of expenses',
      'Reduce takeout and dining frequency',
      'Look for grocery deals and meal-prep opportunities',
    ],
  };
}

module.exports = { buildSnapshot, buildDemoSnapshot };
