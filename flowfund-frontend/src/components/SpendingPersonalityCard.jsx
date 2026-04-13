import { useMemo } from 'react';
import { C } from '../theme/flowfundTheme';
import { parseTxnDate } from '../utils/transactionDate';
import { normalizeSpendCategory } from '../utils/spendCategoryDisplay';

/**
 * Deterministic, rule-based spending personality derived from the last 30 days
 * of transaction data already available on the Dashboard.
 * All logic is transparent and explainable — no black-box scoring.
 */
function computePersonality(transactions) {
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

  if (expenses.length < 3) return null;

  const total = expenses.reduce((s, t) => s + parseFloat(t.amount || 0), 0);
  if (total === 0) return null;

  // Build category map
  const catMap = {};
  for (const t of expenses) {
    const cat = normalizeSpendCategory(t.category || 'Other');
    catMap[cat] = (catMap[cat] || 0) + parseFloat(t.amount || 0);
  }

  const catCount = Object.keys(catMap).length;

  // Spending buckets
  const essentials =
    (catMap['Groceries'] || 0) +
    (catMap['Health & Fitness'] || 0) +
    (catMap['Education'] || 0);

  const discretionary =
    (catMap['Food & Drink'] || 0) +
    (catMap['Entertainment'] || 0) +
    (catMap['Shopping'] || 0) +
    (catMap['Travel'] || 0);

  const essentialsPct = essentials / total;
  const discretionaryPct = discretionary / total;
  const savingsRate = income > 0 ? Math.max(0, (income - total) / income) : null;

  // ── Personality rules (evaluated in priority order) ───────────────────────

  // 1 — Strong saver
  if (savingsRate !== null && savingsRate >= 0.20) {
    return {
      label: 'Cautious Saver',
      emoji: '🏦',
      color: C.income,
      explanation: `You saved roughly ${Math.round(savingsRate * 100)}% of your income this month — well above average. Your habits show strong financial discipline.`,
      tip: 'Keep it up. Consider directing extra savings toward an emergency fund or long-term goals.',
    };
  }

  // 2 — Essentials-dominated
  if (essentialsPct >= 0.55) {
    return {
      label: 'Essentials Focused',
      emoji: '🏠',
      color: '#0ea5e9',
      explanation: `${Math.round(essentialsPct * 100)}% of your spending went to essentials like groceries, health, and education. You keep your priorities on needs over wants.`,
      tip: 'A solid foundation — even small automatic savings transfers can compound significantly from here.',
    };
  }

  // 3 — Discretionary-heavy
  if (discretionaryPct >= 0.55) {
    return {
      label: 'Lifestyle Spender',
      emoji: '🛍️',
      color: C.warning,
      explanation: `${Math.round(discretionaryPct * 100)}% of your spending this month was discretionary — dining, entertainment, and shopping. You enjoy a flexible lifestyle.`,
      tip: 'A small monthly cap for discretionary spending can help maintain balance without limiting enjoyment.',
    };
  }

  // 4 — Well-balanced across categories
  if (catCount >= 4 && essentialsPct >= 0.25 && discretionaryPct >= 0.20) {
    return {
      label: 'Balanced Spender',
      emoji: '⚖️',
      color: C.brand,
      explanation: `Your spending spans ${catCount} categories with a healthy mix of essentials and lifestyle. You maintain balance between needs and wants.`,
      tip: 'Sustaining this balance while gradually increasing your savings rate is a strong long-term strategy.',
    };
  }

  // 5 — Highly concentrated (1–2 categories only)
  if (catCount <= 2) {
    return {
      label: 'Focused Spender',
      emoji: '🎯',
      color: '#8b5cf6',
      explanation: `Your spending is concentrated in just ${catCount === 1 ? 'one area' : 'two areas'} this month. This focus makes your budget straightforward to track and adjust.`,
      tip: 'Focused spending often leaves clear room for savings — consider a dedicated savings goal.',
    };
  }

  // 6 — Default: no dominant pattern
  return {
    label: 'Flexible Spender',
    emoji: '🌊',
    color: '#3b82f6',
    explanation: 'Your spending this month adapts without a single dominant pattern — a sign of flexibility across different areas of life.',
    tip: 'Reviewing your monthly totals periodically can help spot trends before they become habits.',
  };
}

export default function SpendingPersonalityCard({ transactions, hasBankLink }) {
  const personality = useMemo(() => computePersonality(transactions), [transactions]);

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
          <div style={{ fontSize: '16px', fontWeight: 700, color: C.ink }}>Spending Personality</div>
          <div style={{ fontSize: '12px', color: C.muted, marginTop: '2px' }}>
            Based on your last 30 days
          </div>
        </div>
        <div style={{
          width: 32, height: 32, borderRadius: '10px',
          background: C.accentFade,
          display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '15px',
        }}>
          🧠
        </div>
      </div>

      {/* Body */}
      <div style={{ padding: '20px 24px' }}>
        {!personality ? (
          <div style={{ padding: '20px 0', textAlign: 'center', color: C.faint, fontSize: '13px' }}>
            {!hasBankLink
              ? 'Connect a bank account to reveal your spending personality.'
              : 'Add at least 3 recent transactions to unlock this insight.'}
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            {/* Personality label */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
              <div style={{
                width: 52, height: 52, borderRadius: '14px', flexShrink: 0,
                background: `${personality.color}14`,
                border: `1.5px solid ${personality.color}30`,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: '22px',
              }}>
                {personality.emoji}
              </div>
              <div>
                <div style={{
                  fontSize: '18px', fontWeight: 800,
                  color: personality.color,
                  letterSpacing: '-0.02em', lineHeight: 1.2,
                }}>
                  {personality.label}
                </div>
                <div style={{ fontSize: '11px', color: C.faint, marginTop: '3px', fontWeight: 600, letterSpacing: '0.04em', textTransform: 'uppercase' }}>
                  This Month's Pattern
                </div>
              </div>
            </div>

            {/* Explanation */}
            <p style={{
              margin: 0, fontSize: '13px', color: C.ink,
              lineHeight: '1.6', padding: '12px 14px',
              background: 'rgba(26,77,62,0.03)',
              border: `1px solid ${C.border}`,
              borderRadius: C.rs,
            }}>
              {personality.explanation}
            </p>

            {/* Tip */}
            <div style={{
              display: 'flex', gap: '10px', alignItems: 'flex-start',
              padding: '10px 14px', borderRadius: C.rs,
              background: C.accentFade,
              border: `1px solid rgba(46,204,138,0.18)`,
            }}>
              <span style={{ fontSize: '14px', flexShrink: 0, marginTop: '1px' }}>💬</span>
              <p style={{ margin: 0, fontSize: '12px', color: C.brand, lineHeight: '1.55', fontWeight: 500 }}>
                {personality.tip}
              </p>
            </div>

            <p style={{ margin: 0, fontSize: '11px', color: C.faint, textAlign: 'center' }}>
              Based on observable spending patterns · Not a financial assessment
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
