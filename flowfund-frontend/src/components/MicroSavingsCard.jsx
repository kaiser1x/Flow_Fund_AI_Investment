import { useMemo } from 'react';
import { C } from '../theme/flowfundTheme';
import { parseTxnDate } from '../utils/transactionDate';
import { normalizeSpendCategory } from '../utils/spendCategoryDisplay';

/**
 * Derives 2–3 lightweight, rule-based savings suggestions from the last 30
 * days of transaction data already available on the Dashboard.
 * No API calls — purely client-side derived logic.
 */
function computeSuggestions(transactions) {
  const now = new Date();
  const d30 = new Date(now - 30 * 86400000);
  d30.setHours(0, 0, 0, 0);

  const expenses = transactions.filter((t) => {
    if (t.transaction_type !== 'EXPENSE') return false;
    const d = parseTxnDate(t.transaction_date);
    return d && !Number.isNaN(d.getTime()) && d >= d30;
  });

  const income = transactions
    .filter((t) => {
      if (t.transaction_type !== 'INCOME') return false;
      const d = parseTxnDate(t.transaction_date);
      return d && !Number.isNaN(d.getTime()) && d >= d30;
    })
    .reduce((s, t) => s + parseFloat(t.amount || 0), 0);

  if (expenses.length === 0) return [];

  const total = expenses.reduce((s, t) => s + parseFloat(t.amount || 0), 0);

  // Category totals
  const catMap = {};
  for (const t of expenses) {
    const cat = normalizeSpendCategory(t.category || 'Other');
    catMap[cat] = (catMap[cat] || 0) + parseFloat(t.amount || 0);
  }

  // Merchant frequency — for recurring/small-purchase detection
  const merchantCount = {};
  for (const t of expenses) {
    const m = (t.merchant || t.description || 'unknown').toLowerCase();
    merchantCount[m] = (merchantCount[m] || 0) + 1;
  }

  const suggestions = [];

  // Rule 1 — High dining spend (>25% of total)
  const diningAmt = catMap['Food & Drink'] || 0;
  if (total > 0 && diningAmt / total > 0.25) {
    const weeklyEst = Math.round(diningAmt / 4);
    suggestions.push({
      icon: '🍽️',
      text: `Dining & drinks accounted for ${Math.round((diningAmt / total) * 100)}% of your spending. Skipping one meal out per week could free up ~$${weeklyEst}/month.`,
    });
  }

  // Rule 2 — Many small purchases (<$15 each, 8+)
  const smallTxns = expenses.filter((t) => parseFloat(t.amount) < 15);
  if (smallTxns.length >= 8) {
    const smallTotal = smallTxns.reduce((s, t) => s + parseFloat(t.amount || 0), 0);
    suggestions.push({
      icon: '☕',
      text: `You made ${smallTxns.length} small purchases under $15, totalling $${Math.round(smallTotal)}. These add up — tracking them can uncover easy savings.`,
    });
  }

  // Rule 3 — Recurring merchants (same name 3+ times in 30 days)
  const recurring = Object.entries(merchantCount).filter(([, n]) => n >= 3);
  if (recurring.length > 0) {
    suggestions.push({
      icon: '🔁',
      text: `${recurring.length} merchant${recurring.length > 1 ? 's appear' : ' appears'} multiple times this month. Reviewing recurring charges may reveal subscriptions you no longer need.`,
    });
  }

  // Rule 4 — Low savings rate (income known, saving <10%)
  const savingsRate = income > 0 ? (income - total) / income : null;
  if (savingsRate !== null && savingsRate < 0.10) {
    const autoSave = Math.round(income * 0.05);
    suggestions.push({
      icon: '🏦',
      text: `Your savings rate this month is ${Math.round(Math.max(0, savingsRate) * 100)}%. Automatically setting aside $${autoSave}/month (5%) could build a meaningful safety net over time.`,
    });
  }

  return suggestions.slice(0, 3);
}

export default function MicroSavingsCard({ transactions, hasBankLink }) {
  const suggestions = useMemo(() => computeSuggestions(transactions), [transactions]);

  const isEmpty = suggestions.length === 0;

  return (
    <div style={{
      background: C.surface, borderRadius: C.r,
      border: `1px solid ${C.border}`, boxShadow: C.shadow,
      overflow: 'hidden',
    }}>
      {/* Header */}
      <div style={{
        padding: '18px 24px', borderBottom: `1px solid ${C.border}`,
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
      }}>
        <div>
          <div style={{ fontSize: '16px', fontWeight: 700, color: C.ink }}>Micro Savings</div>
          <div style={{ fontSize: '12px', color: C.muted, marginTop: '2px' }}>
            Small opportunities from your last 30 days
          </div>
        </div>
        <div style={{
          width: 32, height: 32, borderRadius: '10px',
          background: C.accentFade,
          display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '15px',
        }}>
          💡
        </div>
      </div>

      {/* Body */}
      <div style={{ padding: '16px 24px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
        {isEmpty ? (
          <div style={{ padding: '20px 0', textAlign: 'center', color: C.faint, fontSize: '13px' }}>
            {!hasBankLink
              ? 'Connect a bank account to unlock savings suggestions.'
              : 'Not enough recent transactions to generate suggestions yet.'}
          </div>
        ) : (
          <>
            {suggestions.map((s, i) => (
              <div key={i} style={{
                display: 'flex', gap: '12px', alignItems: 'flex-start',
                padding: '12px 14px', borderRadius: C.rs,
                background: 'rgba(26,77,62,0.03)',
                border: `1px solid ${C.border}`,
              }}>
                <span style={{ fontSize: '18px', lineHeight: 1, flexShrink: 0, marginTop: '1px' }}>
                  {s.icon}
                </span>
                <p style={{
                  margin: 0, fontSize: '13px', color: C.ink,
                  lineHeight: '1.55', fontWeight: 400,
                }}>
                  {s.text}
                </p>
              </div>
            ))}
            <p style={{
              margin: 0, fontSize: '11px', color: C.faint,
              textAlign: 'center', paddingTop: '4px',
            }}>
              Suggestions based on your spending patterns · Not financial advice
            </p>
          </>
        )}
      </div>
    </div>
  );
}
