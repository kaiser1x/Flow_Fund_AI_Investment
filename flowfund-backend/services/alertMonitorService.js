'use strict';

const pool = require('../config/db');
const { notifyUser } = require('./safeNotification');
const anomalyEvent = require('./anomalyEventService');
const { getPreferences } = require('./alertPreferencesService');
const { isCustomerFlowfundUserId } = require('./customerFlowfundDemo');

const SPIKE_TITLE = 'Spending up vs last month';
const WEEKLY_BIG_TITLE = 'Your biggest expense this week';
const LOW_CASH_TITLE = 'Low cash buffer';
const READINESS_TITLE = 'Investment readiness update';

async function transactionCount(userId) {
  const [rows] = await pool.query(
    `SELECT COUNT(*) AS c FROM transactions t
     INNER JOIN bank_accounts b ON t.account_id = b.account_id WHERE b.user_id = ?`,
    [userId]
  );
  return parseInt(rows[0]?.c, 10) || 0;
}

async function topExpenseCategoryLast30(userId) {
  const [rows] = await pool.query(
    `SELECT t.category AS category, COALESCE(SUM(t.amount), 0) AS total
     FROM transactions t INNER JOIN bank_accounts b ON t.account_id = b.account_id
     WHERE b.user_id = ? AND t.transaction_type = 'EXPENSE'
       AND t.transaction_date >= DATE_SUB(CURDATE(), INTERVAL 30 DAY)
     GROUP BY t.category ORDER BY total DESC LIMIT 1`,
    [userId]
  );
  if (!rows.length) return null;
  const r = rows[0];
  return { category: r.category || 'Uncategorized', total: parseFloat(r.total) || 0 };
}

async function topCategorySpendSpike(userId) {
  const top = await topExpenseCategoryLast30(userId);
  if (!top || top.total < 1) return null;
  const cat = top.category;
  const [recentRows] = await pool.query(
    `SELECT COALESCE(SUM(t.amount), 0) AS s FROM transactions t
     INNER JOIN bank_accounts b ON t.account_id = b.account_id
     WHERE b.user_id = ? AND t.transaction_type = 'EXPENSE' AND t.category = ?
       AND t.transaction_date >= DATE_SUB(CURDATE(), INTERVAL 30 DAY)`,
    [userId, cat]
  );
  const [priorRows] = await pool.query(
    `SELECT COALESCE(SUM(t.amount), 0) AS s FROM transactions t
     INNER JOIN bank_accounts b ON t.account_id = b.account_id
     WHERE b.user_id = ? AND t.transaction_type = 'EXPENSE' AND t.category = ?
       AND t.transaction_date >= DATE_SUB(CURDATE(), INTERVAL 60 DAY)
       AND t.transaction_date < DATE_SUB(CURDATE(), INTERVAL 30 DAY)`,
    [userId, cat]
  );
  const recent = parseFloat(recentRows[0]?.s) || 0;
  const prior = parseFloat(priorRows[0]?.s) || 0;
  if (prior < 50) return null;
  const pct = ((recent - prior) / prior) * 100;
  if (pct < 20) return null;
  return { category: cat, recent, prior, pctIncrease: pct };
}

async function largestExpenseLast7Days(userId) {
  let rows;
  try {
    [rows] = await pool.query(
      `SELECT t.amount,
              COALESCE(NULLIF(t.merchant_name, ''), t.description, 'Purchase') AS merchant,
              t.category, t.transaction_date
       FROM transactions t INNER JOIN bank_accounts b ON t.account_id = b.account_id
       WHERE b.user_id = ? AND t.transaction_type = 'EXPENSE'
         AND t.transaction_date >= DATE_SUB(CURDATE(), INTERVAL 7 DAY)
       ORDER BY t.amount DESC LIMIT 1`,
      [userId]
    );
  } catch (_) {
    [rows] = await pool.query(
      `SELECT t.amount, COALESCE(t.description, 'Purchase') AS merchant, t.category, t.transaction_date
       FROM transactions t INNER JOIN bank_accounts b ON t.account_id = b.account_id
       WHERE b.user_id = ? AND t.transaction_type = 'EXPENSE'
         AND t.transaction_date >= DATE_SUB(CURDATE(), INTERVAL 7 DAY)
       ORDER BY t.amount DESC LIMIT 1`,
      [userId]
    );
  }
  if (!rows.length) return null;
  const r = rows[0];
  const d = r.transaction_date;
  const dateStr = d instanceof Date ? d.toISOString().slice(0, 10) : String(d || '').slice(0, 10);
  return {
    amount: parseFloat(r.amount) || 0,
    merchant: r.merchant || 'Purchase',
    category: r.category || 'Expense',
    date: dateStr,
  };
}

async function recentSpikeNotification(userId) {
  const [rows] = await pool.query(
    `SELECT 1 FROM notifications WHERE user_id = ? AND type = 'spending_alert' AND title = ?
       AND created_at >= DATE_SUB(NOW(), INTERVAL 3 DAY) LIMIT 1`,
    [userId, SPIKE_TITLE]
  );
  return rows.length > 0;
}

async function weeklyBigExpenseAlreadySent(userId) {
  const [rows] = await pool.query(
    `SELECT COUNT(*) AS c FROM notifications WHERE user_id = ? AND type = 'large_transaction' AND title = ?
       AND created_at >= DATE_SUB(NOW(), INTERVAL 3 DAY)`,
    [userId, WEEKLY_BIG_TITLE]
  );
  return (parseInt(rows[0]?.c, 10) || 0) > 0;
}

async function lowCashNotifiedRecently(userId) {
  const [rows] = await pool.query(
    `SELECT 1 FROM notifications WHERE user_id = ? AND title = ?
       AND created_at >= DATE_SUB(NOW(), INTERVAL 7 DAY) LIMIT 1`,
    [userId, LOW_CASH_TITLE]
  );
  return rows.length > 0;
}

async function fetchRecentExpenseTransactions(userId, minutes = 20) {
  const m = Math.min(120, Math.max(5, parseInt(minutes, 10) || 20));
  let rows;
  try {
    [rows] = await pool.query(
      `SELECT t.transaction_id, t.amount, t.category,
              COALESCE(NULLIF(t.merchant_name, ''), t.description, 'Purchase') AS merchant,
              t.transaction_date
       FROM transactions t INNER JOIN bank_accounts b ON t.account_id = b.account_id
       WHERE b.user_id = ? AND t.transaction_type = 'EXPENSE'
         AND t.created_at >= DATE_SUB(NOW(), INTERVAL ${m} MINUTE)`,
      [userId]
    );
  } catch (_) {
    [rows] = await pool.query(
      `SELECT t.transaction_id, t.amount, t.category, COALESCE(t.description, 'Purchase') AS merchant, t.transaction_date
       FROM transactions t INNER JOIN bank_accounts b ON t.account_id = b.account_id
       WHERE b.user_id = ? AND t.transaction_type = 'EXPENSE'
         AND t.created_at >= DATE_SUB(NOW(), INTERVAL ${m} MINUTE)`,
      [userId]
    );
  }
  return rows;
}

async function baselineAvgExpense(userId, category, excludeId) {
  const [catRows] = await pool.query(
    `SELECT AVG(t.amount) AS a, COUNT(*) AS c FROM transactions t
     INNER JOIN bank_accounts b ON t.account_id = b.account_id
     WHERE b.user_id = ? AND t.transaction_type = 'EXPENSE' AND t.category = ?
       AND t.transaction_date >= DATE_SUB(CURDATE(), INTERVAL 90 DAY)
       AND t.transaction_id <> ?`,
    [userId, category, excludeId]
  );
  const c = parseInt(catRows[0]?.c, 10) || 0;
  const catAvg = parseFloat(catRows[0]?.a) || 0;
  if (c >= 5) return { avg: catAvg, source: 'category' };

  const [allRows] = await pool.query(
    `SELECT AVG(t.amount) AS a, COUNT(*) AS c FROM transactions t
     INNER JOIN bank_accounts b ON t.account_id = b.account_id
     WHERE b.user_id = ? AND t.transaction_type = 'EXPENSE'
       AND t.transaction_date >= DATE_SUB(CURDATE(), INTERVAL 90 DAY)
       AND t.transaction_id <> ?`,
    [userId, excludeId]
  );
  return { avg: parseFloat(allRows[0]?.a) || 0, source: 'all', count: parseInt(allRows[0]?.c, 10) || 0 };
}

async function runAmountAnomalies(userId, prefs) {
  if (!prefs.anomaly_amount_enabled) return;
  const txns = await fetchRecentExpenseTransactions(userId, 25);
  for (const t of txns) {
    const tid = t.transaction_id;
    const amt = parseFloat(t.amount) || 0;
    if (amt < 15) continue;
    if (await anomalyEvent.hasTxnAnomalyRecently(userId, tid, 'amount_vs_historical_avg', 7)) continue;

    const { avg, source } = await baselineAvgExpense(userId, t.category || 'Uncategorized', tid);
    if (avg < 10) continue;
    const mult = prefs.anomaly_amount_multiplier;
    if (amt < avg * mult) continue;

    const pctOver = Math.round(((amt - avg) / avg) * 100);
    const details = {
      transaction_id: tid,
      amount: amt,
      baseline_avg: Math.round(avg * 100) / 100,
      baseline_scope: source,
      category: t.category,
      multiplier_threshold: mult,
      pct_over_avg: pctOver,
    };

    const ok = await notifyUser(
      userId,
      'large_transaction',
      'Unusual expense amount',
      `${t.merchant}: $${amt.toFixed(2)} is about ${pctOver}% above your typical ${source === 'category' ? t.category + ' ' : ''}spending (90-day avg ~$${avg.toFixed(2)}). Review if this was expected.`
    );
    if (ok) {
      await anomalyEvent.recordEvent(userId, {
        anomalyType: 'amount_vs_historical_avg',
        transactionId: tid,
        severity: amt >= avg * mult * 1.5 ? 'high' : 'warning',
        details,
        notificationSent: true,
      });
    }
  }
}

async function runSpendingSpike(userId, prefs, imported, count) {
  if (!prefs.spending_spike_enabled || imported <= 0 || count <= 0) return;
  if (await recentSpikeNotification(userId)) return;
  const spike = await topCategorySpendSpike(userId);
  if (!spike) return;
  const ok = await notifyUser(
    userId,
    'spending_alert',
    SPIKE_TITLE,
    `${spike.category} is running about ${Math.round(spike.pctIncrease)}% higher than the prior 30 days ($${spike.recent.toFixed(0)} vs $${spike.prior.toFixed(0)}). Worth a quick look.`
  );
  if (ok) {
    await anomalyEvent.recordEvent(userId, {
      anomalyType: 'spending_category_spike',
      severity: 'warning',
      details: spike,
      notificationSent: true,
    });
  }
}

async function runWeeklyHighlight(userId, prefs, count) {
  if (!prefs.weekly_expense_highlight_enabled || count <= 0) return;
  if (await weeklyBigExpenseAlreadySent(userId)) return;
  const big = await largestExpenseLast7Days(userId);
  if (!big || big.amount < 25) return;
  const ok = await notifyUser(
    userId,
    'large_transaction',
    WEEKLY_BIG_TITLE,
    `${big.merchant} — $${big.amount.toFixed(2)} (${big.category}, ${big.date}).`
  );
  if (ok) {
    await anomalyEvent.recordEvent(userId, {
      anomalyType: 'weekly_expense_highlight',
      severity: 'info',
      details: big,
      notificationSent: true,
    });
  }
}

async function runLowCashBuffer(userId, prefs, metrics) {
  if (!prefs.low_cash_buffer_enabled || !metrics) return;
  const months = parseFloat(metrics.cash_buffer_months);
  if (!Number.isFinite(months)) return;
  const threshold = prefs.low_cash_buffer_threshold_months;
  if (months >= threshold) return;
  if (await lowCashNotifiedRecently(userId)) return;

  const ok = await notifyUser(
    userId,
    'budget_warning',
    LOW_CASH_TITLE,
    `Your estimated cash buffer is about ${months.toFixed(1)} months of expenses — below your ${threshold.toFixed(1)}-month alert threshold. Consider building reserves before increasing discretionary spending.`
  );
  if (ok) {
    await anomalyEvent.recordEvent(userId, {
      anomalyType: 'low_cash_buffer',
      severity: 'warning',
      details: { cash_buffer_months: months, threshold },
      notificationSent: true,
    });
  }
}

async function runReadinessChange(userId, prefs) {
  if (!prefs.readiness_change_enabled) return;

  const [rows] = await pool.query(
    `SELECT score_value, generated_at, score_id
     FROM investment_scores WHERE user_id = ?
     ORDER BY generated_at DESC, score_id DESC LIMIT 2`,
    [userId]
  );
  if (rows.length < 2) return;
  const newest = parseInt(rows[0].score_value, 10);
  const older = parseInt(rows[1].score_value, 10);
  if (!Number.isFinite(newest) || !Number.isFinite(older)) return;
  const delta = newest - older;
  const minPts = Math.max(1, parseInt(prefs.readiness_change_min_points, 10) || 1);
  if (delta === 0) return;
  if (Math.abs(delta) < minPts) return;

  // Short cooldown blocks duplicate spam, but not a *new* headline score (e.g. drop to 20 then jump to 80 after income).
  if (await anomalyEvent.hasRecentEventMinutes(userId, 'readiness_score_change', 5)) {
    const last = await anomalyEvent.getLatestReadinessScoreChangeDetails(userId);
    const lastAnnounced =
      last?.current != null && Number.isFinite(parseInt(last.current, 10))
        ? parseInt(last.current, 10)
        : null;
    if (lastAnnounced == null || lastAnnounced === newest) {
      return;
    }
  }

  const dir = delta > 0 ? 'up' : 'down';
  const ok = await notifyUser(
    userId,
    'system',
    READINESS_TITLE,
    `Your investment readiness score moved ${dir} by ${Math.abs(delta)} points (now ${newest}, was ${older}). Open Investment Readiness for details.`
  );
  if (ok) {
    await anomalyEvent.recordEvent(userId, {
      anomalyType: 'readiness_score_change',
      severity: 'info',
      details: { previous: older, current: newest, delta },
      notificationSent: true,
    });
  }
}

async function runGoalMilestones(userId, prefs) {
  if (!prefs.goal_milestone_enabled) return;
  const [goals] = await pool.query(
    `SELECT goal_id, name, target_amount, current_amount, status FROM goals WHERE user_id = ? AND status = 'active'`,
    [userId]
  );
  for (const g of goals) {
    const target = parseFloat(g.target_amount) || 0;
    const current = parseFloat(g.current_amount) || 0;
    if (target <= 0) continue;
    const pct = Math.min(100, Math.round((current / target) * 100));
    for (const m of [50, 75, 100]) {
      if (pct < m) continue;
      if (await anomalyEvent.hasGoalMilestone(userId, g.goal_id, m)) continue;
      const ok = await notifyUser(
        userId,
        'system',
        'Goal milestone',
        `“${g.name}” reached ${m}% progress ($${current.toFixed(2)} of $${target.toFixed(2)}).`
      );
      if (ok) {
        await anomalyEvent.recordEvent(userId, {
          anomalyType: 'goal_milestone',
          severity: 'info',
          details: { goal_id: g.goal_id, milestone: m, name: g.name, progress_pct: pct },
          notificationSent: true,
        });
      }
    }
  }
}

/**
 * Threshold-based monitors (no ML). Call after Plaid sync + metrics recompute.
 * @param {number} userId
 * @param {{ imported?: number, metrics?: object|null }} opts
 */
async function runAfterSync(userId, opts = {}) {
  const imported = Math.max(0, parseInt(opts.imported, 10) || 0);
  const metrics = opts.metrics || null;

  try {
    const [plinked] = await pool.query('SELECT COUNT(*) AS c FROM plaid_items WHERE user_id = ?', [userId]);
    let allowMonitor = (plinked[0]?.c || 0) > 0;
    if (!allowMonitor && (await isCustomerFlowfundUserId(userId))) {
      const [ar] = await pool.query('SELECT COUNT(*) AS c FROM bank_accounts WHERE user_id = ?', [userId]);
      allowMonitor = (ar[0]?.c || 0) > 0;
    }
    if (!allowMonitor) return;

    const prefs = await getPreferences(userId);
    const count = await transactionCount(userId);
    if (count === 0 && imported === 0) return;

    // Run readiness first, isolated: other monitors can throw (e.g. odd metrics / DB) and must not skip score-change alerts.
    try {
      await runReadinessChange(userId, prefs);
    } catch (e) {
      console.error('[ALERT_MONITOR] readiness', e.message);
    }

    if (imported > 0) await runAmountAnomalies(userId, prefs);
    if (imported > 0) await runSpendingSpike(userId, prefs, imported, count);
    await runWeeklyHighlight(userId, prefs, count);
    if (metrics) await runLowCashBuffer(userId, prefs, metrics);
    await runGoalMilestones(userId, prefs);
  } catch (err) {
    console.error('[ALERT_MONITOR]', err.message);
  }
}

module.exports = {
  runAfterSync,
  SPIKE_TITLE,
  WEEKLY_BIG_TITLE,
};
