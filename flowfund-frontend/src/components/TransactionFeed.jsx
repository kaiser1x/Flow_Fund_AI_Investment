import { parseTxnDate, ymdLocal } from '../utils/transactionDate';
import { spendCategoryDisplay } from '../utils/spendCategoryDisplay';
import { C } from '../theme/flowfundTheme';

function getDateLabel(raw) {
  const d = parseTxnDate(raw);
  if (!d) return 'Unknown date';
  const today = new Date();
  const todayStr = ymdLocal(today);
  const yest = new Date(today);
  yest.setDate(yest.getDate() - 1);
  const yesterStr = ymdLocal(yest);
  const weekAgo = new Date(today);
  weekAgo.setDate(weekAgo.getDate() - 7);
  weekAgo.setHours(0, 0, 0, 0);

  const ymd = ymdLocal(d);
  if (ymd === todayStr) return 'Today';
  if (ymd === yesterStr) return 'Yesterday';
  if (d >= weekAgo) return 'This Week';
  return d.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
}

function groupByDate(txns) {
  const map = new Map();
  for (const t of txns) {
    const label = getDateLabel(t.transaction_date);
    if (!map.has(label)) map.set(label, []);
    map.get(label).push(t);
  }
  return map;
}

export default function TransactionFeed({ transactions, isDemo, hasBankLink = true, loading, error }) {
  if (loading) {
    return (
      <div style={{ background: C.surface, borderRadius: C.r, border: `1px solid ${C.border}`, boxShadow: C.shadow, overflow: 'hidden' }}>
        <div style={{ padding: '18px 24px', borderBottom: `1px solid ${C.border}` }}>
          <div style={{ fontSize: '16px', fontWeight: 700, color: C.ink }}>Recent Transactions</div>
        </div>
        <div style={{ padding: '16px 24px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
          {[1, 2, 3, 4].map(i => (
            <div key={i} style={{
              height: 52, borderRadius: C.rs,
              background: 'linear-gradient(90deg, rgba(255,255,255,0.04) 0%, rgba(255,255,255,0.08) 50%, rgba(255,255,255,0.04) 100%)',
              backgroundSize: '400px 100%',
              animation: 'ff-shimmer 1.4s ease infinite',
            }} />
          ))}
        </div>
      </div>
    );
  }

  const groups = groupByDate(transactions);

  return (
    <div style={{ background: C.surface, borderRadius: C.r, border: `1px solid ${C.border}`, boxShadow: C.shadow, overflow: 'hidden' }}>
      {/* Header */}
      <div style={{
        padding: '18px 24px', borderBottom: `1px solid ${C.border}`,
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
      }}>
        <div>
          <div style={{ fontSize: '16px', fontWeight: 700, color: C.ink }}>Recent Transactions</div>
          <div style={{ fontSize: '12px', color: C.muted, marginTop: '2px' }}>
            {transactions.length} transaction{transactions.length !== 1 ? 's' : ''}
          </div>
        </div>
        {isDemo && (
          <span style={{
            fontSize: '10px', fontWeight: 700, letterSpacing: '0.04em',
            background: 'rgba(217,119,6,0.09)', border: '1px solid rgba(217,119,6,0.25)',
            color: '#d97706', borderRadius: '20px', padding: '2px 9px',
          }}>
            DEMO
          </span>
        )}
      </div>

      {/* Feed */}
      <div style={{ maxHeight: '480px', overflowY: 'auto' }}>
        {error && (
          <div style={{ padding: '16px 24px', fontSize: '13px', color: C.danger }}>{error}</div>
        )}
        {!error && transactions.length === 0 ? (
          <div style={{ padding: '48px 24px', textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px' }}>
            <div style={{ fontSize: '36px' }}>📭</div>
            <div style={{ fontSize: '14px', fontWeight: 600, color: C.ink }}>
              {!hasBankLink ? 'No accounts connected' : 'No transactions yet'}
            </div>
            <div style={{ fontSize: '12px', color: C.muted }}>
              {!hasBankLink
                ? 'Connect your bank on the dashboard to get started.'
                : 'Sync from your bank or check back after new activity.'}
            </div>
          </div>
        ) : (
          Array.from(groups.entries()).map(([label, txns]) => (
            <div key={label}>
              <div style={{
                padding: '10px 24px 5px',
                fontSize: '11px', fontWeight: 700,
                color: C.faint, textTransform: 'uppercase', letterSpacing: '0.09em',
                background: 'rgba(255,255,255,0.03)',
                borderBottom: `1px solid ${C.border}`,
              }}>
                {label}
              </div>
              {txns.map((txn, i) => {
                const isIncome = txn.transaction_type === 'INCOME';
                const { emoji, color: markColor } = spendCategoryDisplay(txn.category, isIncome);
                const tint = isIncome ? 'rgba(5,150,105,0.1)' : `${markColor}14`;
                const borderTint = isIncome ? 'rgba(5,150,105,0.22)' : `${markColor}35`;
                const amt  = parseFloat(txn.amount || 0);
                const merchant = txn.merchant || txn.description || 'Unknown';

                return (
                  <div
                    key={txn.transaction_id || `${label}-${i}`}
                    style={{
                      display: 'flex', alignItems: 'center', gap: '14px',
                      padding: '12px 24px',
                      borderBottom: `1px solid ${C.border}`,
                      cursor: 'default',
                    }}
                    onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.04)'; }}
                    onMouseLeave={e => { e.currentTarget.style.background = ''; }}
                  >
                    <div style={{
                      width: 38, height: 38, borderRadius: '11px', flexShrink: 0,
                      background: tint,
                      border: `1px solid ${borderTint}`,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: '19px',
                      lineHeight: 1,
                    }}>
                      {emoji}
                    </div>

                    {/* Meta */}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{
                        fontSize: '14px', fontWeight: 600, color: C.ink,
                        whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                      }}>
                        {merchant}
                      </div>
                      <div style={{ fontSize: '12px', color: C.muted, marginTop: '2px' }}>
                        {txn.category || 'Uncategorized'}
                        {txn.pending ? ' · Pending' : ''}
                      </div>
                    </div>

                    {/* Amount */}
                    <div style={{
                      fontSize: '14px', fontWeight: 700,
                      color: isIncome ? C.income : C.expense,
                      fontVariantNumeric: 'tabular-nums',
                      flexShrink: 0,
                    }}>
                      {isIncome ? '+' : '-'}${amt.toFixed(2)}
                    </div>
                  </div>
                );
              })}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
