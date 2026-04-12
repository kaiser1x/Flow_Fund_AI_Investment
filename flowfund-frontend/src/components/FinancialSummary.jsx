import { parseTxnDate } from '../utils/transactionDate';

const CATEGORY_ICONS = {
  'Food & Drink': '🍔',
  'Groceries': '🛒',
  'Transportation': '🚗',
  'Entertainment': '🎬',
  'Shopping': '🛍️',
  'Health & Fitness': '💪',
  'Education': '📚',
  'Income': '💰',
};

function computeSummary(transactions, accounts) {
  const now = new Date();
  const d30 = new Date(now - 30 * 86400000);
  d30.setHours(0, 0, 0, 0);

  const expenses30 = transactions.filter((t) => {
    const d = parseTxnDate(t.transaction_date);
    return t.transaction_type === 'EXPENSE' && d && !Number.isNaN(d.getTime()) && d >= d30;
  });

  const monthlySpend = expenses30.reduce((s, t) => s + parseFloat(t.amount || 0), 0);

  const catMap = {};
  for (const t of expenses30) {
    const c = t.category || 'Other';
    catMap[c] = (catMap[c] || 0) + parseFloat(t.amount || 0);
  }
  const topCategory = Object.entries(catMap).sort((a, b) => b[1] - a[1])[0]?.[0] || '—';

  const totalBalance = accounts.reduce((s, a) => s + parseFloat(a.balance || 0), 0);

  const income30 = transactions
    .filter((t) => {
      const d = parseTxnDate(t.transaction_date);
      return t.transaction_type === 'INCOME' && d && !Number.isNaN(d.getTime()) && d >= d30;
    })
    .reduce((s, t) => s + parseFloat(t.amount || 0), 0);

  const savingsRate = income30 > 0 ? Math.max(0, ((income30 - monthlySpend) / income30) * 100) : null;

  return { totalBalance, monthlySpend, topCategory, savingsRate };
}

const styles = {
  wrapper: {
    marginBottom: '28px',
  },
  grid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(4, 1fr)',
    gap: '16px',
  },
  card: {
    background: '#fff',
    borderRadius: '12px',
    padding: '20px 24px',
    border: '1px solid #e8ecea',
    boxShadow: '0 2px 8px rgba(15,45,37,0.06)',
  },
  label: {
    fontSize: '11px',
    fontWeight: 600,
    color: '#888',
    textTransform: 'uppercase',
    letterSpacing: '0.07em',
    marginBottom: '8px',
  },
  value: {
    fontSize: '22px',
    fontWeight: 700,
    color: '#0f2d25',
    lineHeight: 1.2,
  },
  sub: {
    fontSize: '12px',
    color: '#888',
    marginTop: '4px',
  },
  demoBadge: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '5px',
    background: 'rgba(234, 179, 8, 0.12)',
    color: '#854d0e',
    border: '1px solid rgba(234, 179, 8, 0.35)',
    borderRadius: '20px',
    padding: '3px 10px',
    fontSize: '11px',
    fontWeight: 600,
    marginBottom: '14px',
  },
};

export default function FinancialSummary({ transactions, accounts, isDemo }) {
  const { totalBalance, monthlySpend, topCategory, savingsRate } = computeSummary(
    transactions,
    accounts
  );

  const fmt = (n) =>
    n.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });

  return (
    <div style={styles.wrapper}>
      {isDemo && (
        <div style={styles.demoBadge}>
          <span>⚡</span> Demo data — connect a bank account for real insights
        </div>
      )}
      <div style={styles.grid}>
        <div style={styles.card}>
          <div style={styles.label}>Total Balance</div>
          <div style={styles.value}>{fmt(totalBalance || 0)}</div>
          <div style={styles.sub}>{accounts.length} account{accounts.length !== 1 ? 's' : ''} linked</div>
        </div>

        <div style={styles.card}>
          <div style={styles.label}>Spent This Month</div>
          <div style={{ ...styles.value, color: monthlySpend > 0 ? '#dc2626' : '#0f2d25' }}>
            {fmt(monthlySpend)}
          </div>
          <div style={styles.sub}>Last 30 days</div>
        </div>

        <div style={styles.card}>
          <div style={styles.label}>Top Category</div>
          <div style={{ ...styles.value, fontSize: '18px' }}>
            {CATEGORY_ICONS[topCategory] || '💳'} {topCategory}
          </div>
          <div style={styles.sub}>Highest spend</div>
        </div>

        <div style={styles.card}>
          <div style={styles.label}>Savings Rate</div>
          <div
            style={{
              ...styles.value,
              color: savingsRate === null ? '#888' : savingsRate >= 20 ? '#1a7f37' : '#dc2626',
            }}
          >
            {savingsRate === null ? '—' : `${Math.round(savingsRate)}%`}
          </div>
          <div style={styles.sub}>Of monthly income</div>
        </div>
      </div>
    </div>
  );
}
