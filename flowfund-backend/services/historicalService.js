const pool = require('../config/db');

/**
 * Builds historical financial analysis for a user from stored transaction
 * and investment_scores data. No schema changes required — both tables
 * accumulate rows over time and are ready for range queries.
 *
 * Called by GET /api/financial/historical
 * Supports granularity: 'weekly' | 'monthly'
 * Supports date range: startDate / endDate (YYYY-MM-DD, defaults to last 6 months)
 * Capped at 730 days (~24 months) to prevent runaway queries.
 */

function fmtDate(d) {
  return d.toISOString().slice(0, 10);
}

/**
 * Validates and normalises query parameters.
 * Throws a 400-tagged Error for any invalid input.
 */
function parseParams({ startDate, endDate, granularity } = {}) {
  const validGranularities = ['weekly', 'monthly'];
  const gran = (granularity || 'monthly').toLowerCase();
  if (!validGranularities.includes(gran)) {
    const err = new Error("Invalid granularity. Use 'weekly' or 'monthly'.");
    err.statusCode = 400;
    throw err;
  }

  // Default: first day of 6 months ago through today
  const now = new Date();
  const defaultStart = fmtDate(new Date(now.getFullYear(), now.getMonth() - 5, 1));
  const defaultEnd   = fmtDate(now);

  const start = startDate ? String(startDate).slice(0, 10) : defaultStart;
  const end   = endDate   ? String(endDate).slice(0, 10)   : defaultEnd;

  const dateRe = /^\d{4}-\d{2}-\d{2}$/;
  if (!dateRe.test(start) || !dateRe.test(end)) {
    const err = new Error('Invalid date format. Use YYYY-MM-DD.');
    err.statusCode = 400;
    throw err;
  }

  if (start > end) {
    const err = new Error('startDate must not be after endDate.');
    err.statusCode = 400;
    throw err;
  }

  // Cap at 730 days to guard against accidental full-table scans
  const startMs = new Date(start + 'T00:00:00').getTime();
  const endMs   = new Date(end   + 'T00:00:00').getTime();
  if (endMs - startMs > 730 * 24 * 60 * 60 * 1000) {
    const err = new Error('Date range cannot exceed 24 months.');
    err.statusCode = 400;
    throw err;
  }

  return { startDate: start, endDate: end, granularity: gran };
}

/**
 * Returns a MySQL expression that groups transaction_date into period labels.
 *   monthly → '2026-01'
 *   weekly  → '2026-01-05'  (Monday of that ISO week, as YYYY-MM-DD)
 */
function periodExpression(granularity) {
  if (granularity === 'weekly') {
    // Subtract WEEKDAY offset (0=Mon … 6=Sun) to always land on Monday
    return "DATE_FORMAT(DATE_SUB(t.transaction_date, INTERVAL WEEKDAY(t.transaction_date) DAY), '%Y-%m-%d')";
  }
  return "DATE_FORMAT(t.transaction_date, '%Y-%m')";
}

/**
 * Main entry point — builds the full historical analysis object.
 */
async function buildHistorical(user_id, params) {
  const { startDate, endDate, granularity } = parseParams(params);
  const warnings = [];

  // ── Verify linked accounts exist (matches snapshotService pattern) ─────────
  const [itemRows] = await pool.query(
    'SELECT COUNT(*) AS cnt FROM plaid_items WHERE user_id = ?',
    [user_id]
  );
  if (itemRows[0].cnt === 0) {
    return {
      hasData: false,
      reason:  'No linked bank accounts found.',
      range:   { startDate, endDate, granularity },
    };
  }

  const periodExpr = periodExpression(granularity);

  // ── Income / expense series aggregated by period ───────────────────────────
  // Single pass over the relevant date window — avoids N+1 per period.
  const [seriesRows] = await pool.query(
    `SELECT
       ${periodExpr} AS period,
       COALESCE(SUM(CASE WHEN t.transaction_type = 'INCOME'  THEN t.amount ELSE 0 END), 0) AS income,
       COALESCE(SUM(CASE WHEN t.transaction_type = 'EXPENSE' THEN t.amount ELSE 0 END), 0) AS expenses
     FROM transactions t
     JOIN bank_accounts b ON t.account_id = b.account_id
     WHERE b.user_id = ?
       AND t.transaction_date >= ?
       AND t.transaction_date <= ?
     GROUP BY period
     ORDER BY period ASC`,
    [user_id, startDate, endDate]
  );

  if (seriesRows.length === 0) {
    warnings.push('No transactions found in the selected date range.');
  }

  const series = seriesRows.map(r => {
    const income   = parseFloat(r.income);
    const expenses = parseFloat(r.expenses);
    return {
      period:      r.period,
      income:      parseFloat(income.toFixed(2)),
      expenses:    parseFloat(expenses.toFixed(2)),
      netCashFlow: parseFloat((income - expenses).toFixed(2)),
    };
  });

  // ── Summary totals ─────────────────────────────────────────────────────────
  const totalIncome   = series.reduce((s, r) => s + r.income,   0);
  const totalExpenses = series.reduce((s, r) => s + r.expenses, 0);
  const periodCount   = series.length || 1; // guard divide-by-zero

  const summary = {
    totalIncome:             parseFloat(totalIncome.toFixed(2)),
    totalExpenses:           parseFloat(totalExpenses.toFixed(2)),
    netCashFlow:             parseFloat((totalIncome - totalExpenses).toFixed(2)),
    averageIncomePerPeriod:  parseFloat((totalIncome   / periodCount).toFixed(2)),
    averageExpensePerPeriod: parseFloat((totalExpenses / periodCount).toFixed(2)),
  };

  // ── Category breakdown for expenses in selected range ─────────────────────
  const [catRows] = await pool.query(
    `SELECT
       COALESCE(t.category, 'Uncategorized') AS category,
       COALESCE(SUM(t.amount), 0) AS total
     FROM transactions t
     JOIN bank_accounts b ON t.account_id = b.account_id
     WHERE b.user_id = ?
       AND t.transaction_type = 'EXPENSE'
       AND t.transaction_date >= ?
       AND t.transaction_date <= ?
     GROUP BY category
     ORDER BY total DESC`,
    [user_id, startDate, endDate]
  );

  const categories = catRows.map(r => ({
    category: r.category,
    total:    parseFloat(parseFloat(r.total).toFixed(2)),
  }));

  // ── Readiness score history from investment_scores ─────────────────────────
  // Each transaction import appends a new row, so the table already contains
  // historical snapshots — no schema change required.
  let readinessHistory = [];
  try {
    const [scoreRows] = await pool.query(
      `SELECT score_value, risk_level, generated_at
       FROM investment_scores
       WHERE user_id = ?
         AND generated_at >= ?
         AND generated_at <= DATE_ADD(?, INTERVAL 1 DAY)
       ORDER BY generated_at ASC`,
      [user_id, startDate, endDate]
    );
    readinessHistory = scoreRows.map(r => ({
      date:      fmtDate(new Date(r.generated_at)),
      score:     r.score_value,
      riskLevel: r.risk_level,
    }));
  } catch (_) {
    // Degrade gracefully if investment_scores is unavailable
    warnings.push('Readiness score history is temporarily unavailable.');
  }

  if (
    readinessHistory.length === 0 &&
    !warnings.includes('Readiness score history is temporarily unavailable.')
  ) {
    warnings.push('No readiness score history found for this period. Import transactions to generate scores.');
  }

  return {
    hasData:          true,
    range:            { startDate, endDate, granularity },
    summary,
    series,
    categories,
    readinessHistory,
    warnings,
  };
}

module.exports = { buildHistorical };
