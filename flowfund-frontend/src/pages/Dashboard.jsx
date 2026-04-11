import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { getProfile, logout as logoutApi } from '../api/auth';
import { getAccounts } from '../api/plaid';
import { getTransactions } from '../api/transactions';
import usePlaidLink from '../hooks/usePlaidLink';
import ChatPanel from '../components/ChatPanel';
import TransactionFeed from '../components/TransactionFeed';
import AppHeader, { LogoMark } from '../components/AppHeader';
import InvestmentReadinessWidget from '../components/InvestmentReadinessWidget';
import { C } from '../theme/flowfundTheme';

// ─── Inject keyframe animations ─────────────────────────────────────────────
function useKeyframes() {
  useEffect(() => {
    const id = 'ff-keyframes';
    if (document.getElementById(id)) return;
    const el = document.createElement('style');
    el.id = id;
    el.textContent = `
      @keyframes ff-shimmer {
        0%   { background-position: -400px 0; }
        100% { background-position: 400px 0; }
      }
      @keyframes ff-bounce {
        0%, 80%, 100% { transform: translateY(0); opacity: 0.5; }
        40%            { transform: translateY(-5px); opacity: 1; }
      }
    `;
    document.head.appendChild(el);
  }, []);
}

// ─── StatCard ────────────────────────────────────────────────────────────────
function StatCard({ icon, label, value, sub, valueColor, shimmer }) {
  return (
    <div style={{
      background: C.surface, borderRadius: C.r,
      border: `1px solid ${C.border}`, boxShadow: C.shadowSm,
      padding: '20px 22px', display: 'flex', flexDirection: 'column', gap: '8px',
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{
          fontSize: '11px', fontWeight: 700, color: C.faint,
          textTransform: 'uppercase', letterSpacing: '0.08em',
        }}>
          {label}
        </div>
        <div style={{
          width: 28, height: 28, borderRadius: '8px',
          background: C.accentFade,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: '13px',
        }}>
          {icon}
        </div>
      </div>
      {shimmer ? (
        <div style={{
          height: 28, borderRadius: '6px', width: '65%',
          background: 'linear-gradient(90deg, #e8ede9 0%, #d4ddd8 50%, #e8ede9 100%)',
          backgroundSize: '400px 100%',
          animation: 'ff-shimmer 1.4s ease infinite',
        }} />
      ) : (
        <div style={{
          fontSize: '22px', fontWeight: 800,
          color: valueColor || C.ink,
          letterSpacing: '-0.03em', lineHeight: 1.1,
          fontVariantNumeric: 'tabular-nums',
        }}>
          {value ?? '—'}
        </div>
      )}
      {sub && <div style={{ fontSize: '12px', color: C.muted }}>{sub}</div>}
    </div>
  );
}

// ─── ProfileCard ─────────────────────────────────────────────────────────────
function ProfileCard({ profile, accountsCount, onNavigateToProfile }) {
  if (!profile) return null;
  const name = [profile.first_name, profile.last_name].filter(Boolean).join(' ') || 'User';
  const initials = [profile.first_name, profile.last_name]
    .filter(Boolean).map(n => n[0]?.toUpperCase()).join('') || 'FF';

  return (
    // Clicking the card navigates to /profile (no visual change)
    <div
      onClick={onNavigateToProfile}
      title="View profile"
      style={{
        background: C.surface, borderRadius: C.r,
        border: `1px solid ${C.border}`, boxShadow: C.shadow,
        overflow: 'hidden', cursor: 'pointer',
      }}
    >
      <div style={{ height: '4px', background: `linear-gradient(90deg, ${C.brand} 0%, ${C.accent} 100%)` }} />
      <div style={{ padding: '22px 24px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '14px', marginBottom: '20px' }}>
          <div style={{
            width: 46, height: 46, borderRadius: '14px', flexShrink: 0,
            background: `linear-gradient(135deg, ${C.brand} 0%, ${C.accent} 100%)`,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: '17px', fontWeight: 800, color: '#fff',
          }}>
            {initials}
          </div>
          <div>
            <div style={{ fontSize: '15px', fontWeight: 700, color: C.ink, lineHeight: 1.2 }}>{name}</div>
            <span style={{
              display: 'inline-block', marginTop: '5px',
              padding: '2px 9px', borderRadius: '20px',
              background: C.accentFade,
              border: '1px solid rgba(46,204,138,0.22)',
              fontSize: '11px', fontWeight: 600, color: C.brand,
            }}>
              {profile.role_name || 'Member'}
            </span>
          </div>
        </div>

        {[
          { label: 'Email', val: profile.email },
          { label: 'Connected', val: `${accountsCount} bank account${accountsCount !== 1 ? 's' : ''}` },
        ].map(({ label, val }) => (
          <div key={label} style={{
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            padding: '10px 0', borderBottom: `1px solid ${C.border}`,
          }}>
            <span style={{ fontSize: '11px', fontWeight: 700, color: C.faint, textTransform: 'uppercase', letterSpacing: '0.07em' }}>
              {label}
            </span>
            <span style={{ fontSize: '13px', color: C.ink, fontWeight: 500, maxWidth: '60%', textAlign: 'right', wordBreak: 'break-word' }}>
              {val}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── BankAccountsCard ─────────────────────────────────────────────────────────
function BankAccountsCard({ accounts, accountsLoading, accountsError, successMessage, plaidError, onOpenPlaid, onRetry, loadingToken, linking, ready }) {
  return (
    <div style={{
      background: C.surface, borderRadius: C.r,
      border: `1px solid ${C.border}`, boxShadow: C.shadow,
      overflow: 'hidden',
    }}>
      <div style={{
        padding: '18px 24px', borderBottom: `1px solid ${C.border}`,
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
      }}>
        <div>
          <div style={{ fontSize: '16px', fontWeight: 700, color: C.ink }}>Bank Accounts</div>
          <div style={{ fontSize: '12px', color: C.muted, marginTop: '2px' }}>
            {accounts.length > 0 ? `${accounts.length} connected` : 'No accounts yet'}
          </div>
        </div>
        <button
          onClick={onOpenPlaid}
          disabled={loadingToken || linking || !ready}
          style={{
            padding: '8px 18px',
            background: (loadingToken || linking || !ready) ? '#dde4e1' : C.brand,
            color: (loadingToken || linking || !ready) ? C.faint : '#fff',
            border: 'none', borderRadius: C.rs,
            fontSize: '13px', fontWeight: 600,
            cursor: (loadingToken || linking || !ready) ? 'not-allowed' : 'pointer',
            whiteSpace: 'nowrap',
          }}
          onMouseEnter={e => { if (!loadingToken && !linking && ready) e.currentTarget.style.background = C.brand2; }}
          onMouseLeave={e => { if (!loadingToken && !linking && ready) e.currentTarget.style.background = C.brand; }}
        >
          {loadingToken ? 'Preparing…' : linking ? 'Linking…' : '+ Connect Bank'}
        </button>
      </div>

      <div style={{ padding: '16px 24px' }}>
        {successMessage && (
          <div style={{
            padding: '10px 14px', borderRadius: C.rs, marginBottom: '12px',
            background: 'rgba(22,163,74,0.07)', border: '1px solid rgba(22,163,74,0.2)',
            fontSize: '13px', color: C.success, fontWeight: 500,
          }}>
            ✓ {successMessage}
          </div>
        )}
        {plaidError && (
          <div style={{
            padding: '10px 14px', borderRadius: C.rs, marginBottom: '12px',
            background: 'rgba(220,38,38,0.06)', border: '1px solid rgba(220,38,38,0.18)',
            fontSize: '13px', color: C.danger,
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          }}>
            <span>{plaidError}</span>
            <button onClick={onRetry} style={{
              background: 'transparent', border: '1px solid currentColor',
              borderRadius: '6px', padding: '3px 10px',
              fontSize: '12px', color: C.danger, cursor: 'pointer',
            }}>Retry</button>
          </div>
        )}
        {accountsError && <p style={{ fontSize: '13px', color: C.danger, margin: '0 0 12px' }}>{accountsError}</p>}

        {accountsLoading ? (
          [1, 2].map(i => (
            <div key={i} style={{
              height: 64, borderRadius: C.rs, marginBottom: '8px',
              background: 'linear-gradient(90deg, #e8ede9 0%, #d4ddd8 50%, #e8ede9 100%)',
              backgroundSize: '400px 100%',
              animation: 'ff-shimmer 1.4s ease infinite',
            }} />
          ))
        ) : accounts.length === 0 ? (
          <div style={{ padding: '28px 0', textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px' }}>
            <div style={{ fontSize: '36px' }}>🏦</div>
            <div style={{ fontSize: '14px', fontWeight: 600, color: C.ink }}>No accounts connected</div>
            <div style={{ fontSize: '12px', color: C.muted }}>Connect your bank to unlock real insights</div>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {accounts.map((acc, i) => (
              <div key={acc.plaid_account_id || i} style={{
                display: 'flex', alignItems: 'center', gap: '14px',
                padding: '14px 16px', borderRadius: C.rs,
                background: '#f8faf9', border: `1px solid ${C.border}`,
              }}>
                <div style={{
                  width: 36, height: 36, borderRadius: '10px', flexShrink: 0,
                  background: `linear-gradient(135deg, ${C.brand} 0%, ${C.brand2} 100%)`,
                  display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '16px',
                }}>
                  🏦
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: '14px', fontWeight: 600, color: C.ink }}>
                    {acc.institution_name || 'Bank'} — {acc.name || acc.type}
                  </div>
                  <div style={{ fontSize: '12px', color: C.muted, marginTop: '2px' }}>
                    {acc.type}{acc.mask ? ` · ****${acc.mask}` : ''}
                  </div>
                </div>
                <div style={{ fontSize: '15px', fontWeight: 700, color: C.ink, fontVariantNumeric: 'tabular-nums', flexShrink: 0 }}>
                  ${Number(acc.balance || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── InsightsCard ─────────────────────────────────────────────────────────────
const CAT_META = {
  'Food & Drink':    ['🍔', '#f59e0b'],
  'Groceries':       ['🛒', '#10b981'],
  'Shopping':        ['🛍️', '#8b5cf6'],
  'Transportation':  ['🚗', '#3b82f6'],
  'Entertainment':   ['🎬', '#ec4899'],
  'Health & Fitness':['💪', '#06b6d4'],
  'Education':       ['📚', '#f97316'],
  'Transfer':        ['💸', '#6b7280'],
};

function InsightsCard({ transactions, isDemo }) {
  const now = new Date();
  const d30 = new Date(now - 30 * 86400000);
  const expenses = transactions.filter(t =>
    t.transaction_type === 'EXPENSE' &&
    new Date(t.transaction_date + 'T12:00:00') >= d30
  );
  const total = expenses.reduce((s, t) => s + parseFloat(t.amount || 0), 0);
  const catMap = {};
  for (const t of expenses) {
    const c = t.category || 'Other';
    catMap[c] = (catMap[c] || 0) + parseFloat(t.amount || 0);
  }
  const cats = Object.entries(catMap)
    .sort((a, b) => b[1] - a[1]).slice(0, 5)
    .map(([label, amt]) => ({ label, amt, pct: total > 0 ? Math.round((amt / total) * 100) : 0 }));

  return (
    <div style={{
      background: C.surface, borderRadius: C.r,
      border: `1px solid ${C.border}`, boxShadow: C.shadow, overflow: 'hidden',
    }}>
      <div style={{
        padding: '18px 24px', borderBottom: `1px solid ${C.border}`,
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
      }}>
        <div>
          <div style={{ fontSize: '16px', fontWeight: 700, color: C.ink }}>Spending Breakdown</div>
          <div style={{ fontSize: '12px', color: C.muted, marginTop: '2px' }}>Last 30 days by category</div>
        </div>
        {isDemo && (
          <span style={{
            fontSize: '10px', fontWeight: 700, letterSpacing: '0.04em',
            background: 'rgba(217,119,6,0.09)', border: '1px solid rgba(217,119,6,0.25)',
            color: C.warning, borderRadius: '20px', padding: '2px 9px',
          }}>
            DEMO
          </span>
        )}
      </div>
      <div style={{ padding: '18px 24px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
        {cats.length === 0 ? (
          <div style={{ padding: '28px 0', textAlign: 'center', color: C.faint, fontSize: '14px' }}>
            No spending data to display yet
          </div>
        ) : cats.map(({ label, amt, pct }) => {
          const [icon, color] = CAT_META[label] || ['💳', C.brand2];
          return (
            <div key={label} style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <span style={{ fontSize: '15px', width: '20px', textAlign: 'center', flexShrink: 0 }}>{icon}</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '5px' }}>
                  <span style={{ fontSize: '13px', fontWeight: 600, color: C.ink }}>{label}</span>
                  <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                    <span style={{ fontSize: '13px', fontWeight: 700, color: C.ink, fontVariantNumeric: 'tabular-nums' }}>
                      ${amt.toFixed(2)}
                    </span>
                    <span style={{ fontSize: '11px', color: C.faint, width: '28px', textAlign: 'right' }}>{pct}%</span>
                  </div>
                </div>
                <div style={{ height: '5px', borderRadius: '3px', background: '#eef1ef', overflow: 'hidden' }}>
                  <div style={{ height: '100%', width: `${pct}%`, borderRadius: '3px', background: color }} />
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Main Dashboard ───────────────────────────────────────────────────────────
export default function Dashboard() {
  useKeyframes();
  const navigate = useNavigate();
  const [profile, setProfile] = useState(null);
  const [profileLoading, setProfileLoading] = useState(true);
  const [profileError, setProfileError] = useState('');
  const [accounts, setAccounts] = useState([]);
  const [accountsLoading, setAccountsLoading] = useState(false);
  const [accountsError, setAccountsError] = useState('');
  const [transactions, setTransactions] = useState([]);
  const [txnLoading, setTxnLoading] = useState(true);
  const [isDemo, setIsDemo] = useState(false);
  const [vw, setVw] = useState(typeof window !== 'undefined' ? window.innerWidth : 1200);

  useEffect(() => {
    const handler = () => setVw(window.innerWidth);
    window.addEventListener('resize', handler);
    return () => window.removeEventListener('resize', handler);
  }, []);
  const isMobile  = vw < 640;
  const isTablet  = vw < 1024;

  const fetchAccounts = useCallback(async () => {
    setAccountsLoading(true);
    setAccountsError('');
    try {
      const { data } = await getAccounts();
      setAccounts(data.accounts || []);
    } catch (err) {
      setAccountsError(err.response?.data?.error || 'Failed to load accounts');
    } finally {
      setAccountsLoading(false);
    }
  }, []);

  const fetchTransactions = useCallback(async () => {
    setTxnLoading(true);
    try {
      const { data } = await getTransactions();
      setTransactions(data.transactions || []);
      setIsDemo(data.isDemo || false);
    } catch (_) {
      setTransactions([]);
    } finally {
      setTxnLoading(false);
    }
  }, []);

  const { openPlaid, ready, loadingToken, linking, error: plaidError, successMessage, retryLinkToken } = usePlaidLink(fetchAccounts);

  useEffect(() => {
    getProfile()
      .then(({ data }) => setProfile(data))
      .catch(err => setProfileError(err.response?.data?.error || 'Failed to load profile'))
      .finally(() => setProfileLoading(false));
    fetchAccounts();
    fetchTransactions();
  }, [fetchAccounts, fetchTransactions]);

  const handleLogout = async () => {
    try { await logoutApi(); } catch (_) {}
    localStorage.removeItem('token');
    navigate('/login');
  };

  // ── Derived stats ──────────────────────────────────────────────────────────
  const now = new Date();
  const d30 = new Date(now - 30 * 86400000);
  const expenses30 = transactions.filter(t =>
    t.transaction_type === 'EXPENSE' &&
    new Date(t.transaction_date + 'T12:00:00') >= d30
  );
  const income30 = transactions.filter(t =>
    t.transaction_type === 'INCOME' &&
    new Date(t.transaction_date + 'T12:00:00') >= d30
  ).reduce((s, t) => s + parseFloat(t.amount || 0), 0);
  const monthlySpend = expenses30.reduce((s, t) => s + parseFloat(t.amount || 0), 0);
  const totalBalance = accounts.reduce((s, a) => s + parseFloat(a.balance || 0), 0);
  const catMap = {};
  for (const t of expenses30) { const c = t.category || 'Other'; catMap[c] = (catMap[c] || 0) + parseFloat(t.amount || 0); }
  const topCategory = Object.entries(catMap).sort((a, b) => b[1] - a[1])[0]?.[0] || '—';
  const savingsRate  = income30 > 0 ? Math.round(Math.max(0, (income30 - monthlySpend) / income30 * 100)) : null;

  const statsLoading = profileLoading || txnLoading;
  const fmt = n => '$' + n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  // ── Full-page loading ──────────────────────────────────────────────────────
  if (profileLoading) {
    return (
      <div style={{ minHeight: '100vh', background: C.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif' }}>
        <div style={{ textAlign: 'center' }}>
          <LogoMark />
          <div style={{ marginTop: '16px', fontSize: '14px', color: C.muted }}>Loading your dashboard…</div>
        </div>
      </div>
    );
  }

  return (
    <div style={{
      minHeight: '100vh', background: C.bg,
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
    }}>
      <AppHeader profile={profile} onLogout={handleLogout} liveData={!isDemo} isDemo={isDemo} />

      <div style={{
        maxWidth: '1280px', margin: '0 auto',
        padding: isMobile ? '20px 16px 40px' : '32px 40px 56px',
      }}>

        {/* Page heading */}
        <div style={{ marginBottom: '28px' }}>
          <h1 style={{
            fontSize: isMobile ? '22px' : '28px', fontWeight: 800,
            color: C.ink, margin: 0, letterSpacing: '-0.025em',
          }}>
            Dashboard
          </h1>
          <p style={{ fontSize: '13px', color: C.muted, margin: '4px 0 0' }}>
            Monitor your financial health and investment readiness
          </p>
          {profileError && (
            <div style={{ marginTop: '12px', padding: '10px 14px', borderRadius: C.rs, background: 'rgba(220,38,38,0.07)', border: '1px solid rgba(220,38,38,0.18)', fontSize: '13px', color: C.danger }}>
              {profileError}
            </div>
          )}
        </div>

        {/* Summary stats */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: isMobile ? '1fr 1fr' : 'repeat(4, 1fr)',
          gap: isMobile ? '12px' : '16px',
          marginBottom: '28px',
        }}>
          <StatCard icon="💰" label="Total Balance"  value={statsLoading ? null : fmt(totalBalance)}         sub={`${accounts.length} account${accounts.length !== 1 ? 's' : ''}`}  shimmer={statsLoading} />
          <StatCard icon="📊" label="Monthly Spend"  value={statsLoading ? null : fmt(monthlySpend)}          sub="Last 30 days"  valueColor={monthlySpend > 0 ? C.expense : C.ink} shimmer={statsLoading} />
          <StatCard icon="📈" label="Savings Rate"   value={statsLoading ? null : (savingsRate !== null ? `${savingsRate}%` : '—')} sub="Of monthly income" valueColor={savingsRate !== null && savingsRate >= 20 ? C.income : C.ink} shimmer={statsLoading} />
          <StatCard icon="🏷️" label="Top Category"   value={statsLoading ? null : topCategory}               sub="Highest spend"  shimmer={statsLoading} />
        </div>

        {/* Main 2-column grid */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: isTablet ? '1fr' : '1fr 360px',
          gap: '24px',
          alignItems: 'start',
        }}>
          {/* Left column */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
            <BankAccountsCard
              accounts={accounts} accountsLoading={accountsLoading} accountsError={accountsError}
              successMessage={successMessage} plaidError={plaidError}
              onOpenPlaid={openPlaid} onRetry={retryLinkToken}
              loadingToken={loadingToken} linking={linking} ready={ready}
            />
            <TransactionFeed transactions={transactions} isDemo={isDemo} loading={txnLoading} />
            <InsightsCard transactions={transactions} isDemo={isDemo} />
          </div>

          {/* Right column */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
            <ProfileCard profile={profile} accountsCount={accounts.length} onNavigateToProfile={() => navigate('/profile')} />
            <div style={{ position: 'sticky', top: '88px', display: 'flex', flexDirection: 'column', gap: '24px' }}>
            <div style={{ position: 'sticky', top: '88px' }}>
              <ChatPanel hasLinkedAccounts={accounts.length > 0} isDemo={isDemo} />
              <InvestmentReadinessWidget />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
