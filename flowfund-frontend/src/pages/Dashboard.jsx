import { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { getProfile, logout as logoutApi } from '../api/auth';
import { getAccounts, syncPlaidFromBank, sandboxRefreshPlaidTransactions, disconnectPlaidLink } from '../api/plaid';
import { getDemoCustomerAccounts } from '../api/financial';
import { getTransactions } from '../api/transactions';
import usePlaidLink from '../hooks/usePlaidLink';
import ChatPanel from '../components/ChatPanel';
import TransactionFeed from '../components/TransactionFeed';
import HistoricalAnalysis from '../components/HistoricalAnalysis';
import MicroSavingsCard from '../components/MicroSavingsCard';
import SpendingPersonalityCard from '../components/SpendingPersonalityCard';
import AppHeader, { LogoMark } from '../components/AppHeader';
import InvestmentReadinessWidget from '../components/InvestmentReadinessWidget';
import GoalsWidget from '../components/GoalsWidget';
import SimulationsWidget from '../components/SimulationsWidget';
import { C } from '../theme/flowfundTheme';
import { parseTxnDate } from '../utils/transactionDate';
import { spendCategoryDisplay } from '../utils/spendCategoryDisplay';

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
function StatCard({ icon, label, value, sub, valueColor, shimmer, accent }) {
  const [hov, setHov] = useState(false);
  return (
    <div
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      style={{
        background: accent ? 'linear-gradient(135deg, #0f2d1e 0%, #0d1b2a 100%)' : C.surface,
        borderRadius: C.r,
        border: accent
          ? '1px solid rgba(46,204,138,0.28)'
          : `1px solid ${hov ? C.borderHover : C.border}`,
        boxShadow: hov
          ? C.shadowHover
          : accent
            ? '0 4px 20px rgba(46,204,138,0.09), 0 2px 8px rgba(0,0,0,0.3)'
            : C.shadowSm,
        padding: '20px 22px',
        display: 'flex', flexDirection: 'column', gap: '8px',
        transform: hov ? 'translateY(-2px)' : 'translateY(0)',
        transition: 'transform 0.18s ease, box-shadow 0.18s ease, border-color 0.18s ease',
      }}
    >
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
          background: 'linear-gradient(90deg, rgba(255,255,255,0.05) 0%, rgba(255,255,255,0.1) 50%, rgba(255,255,255,0.05) 100%)',
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

// ─── BankAccountsCard ─────────────────────────────────────────────────────────
function BankAccountsCard({
  accounts, accountsLoading, accountsError, accountsErrorCode, successMessage, plaidError, onOpenPlaid, onRetry,
  loadingToken, linking, ready, onSyncFromBank, onSandboxRefresh, syncLoading,
  onDisconnectBank, disconnectLoading,
  hasPlaidLinked, disconnectStep = 0,
  onDisconnectBankStepClick, onDisconnectModalCancel, onDisconnectFinalConfirm,
}) {
  return (
    <div style={{
      background: C.surface, borderRadius: C.r,
      border: `1px solid ${C.border}`, boxShadow: C.shadow,
      overflow: 'hidden',
    }}>
      <div style={{
        padding: '18px 24px', borderBottom: `1px solid ${C.border}`,
        display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '12px', flexWrap: 'wrap',
      }}>
        <div>
          <div style={{ fontSize: '16px', fontWeight: 700, color: C.ink }}>Bank Accounts</div>
          <div style={{ fontSize: '12px', color: C.muted, marginTop: '2px' }}>
            {accounts.length > 0 ? `${accounts.length} connected` : 'No accounts yet'}
          </div>
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', justifyContent: 'flex-end' }}>
          {accounts.length > 0 && onSyncFromBank && (
            <button
              type="button"
              onClick={onSyncFromBank}
              disabled={syncLoading || linking}
              style={{
                padding: '8px 14px',
                background: syncLoading || linking ? 'rgba(255,255,255,0.04)' : 'rgba(255,255,255,0.07)',
                color: C.ink,
                border: `1px solid ${C.border}`, borderRadius: C.rs,
                fontSize: '12px', fontWeight: 600,
                cursor: syncLoading || linking ? 'not-allowed' : 'pointer',
                whiteSpace: 'nowrap',
              }}
            >
              {syncLoading ? 'Syncing…' : 'Sync latest'}
            </button>
          )}
          {accounts.length > 0 && onSandboxRefresh && (
            <button
              type="button"
              onClick={onSandboxRefresh}
              disabled={syncLoading || linking}
              title="Uses Plaid /transactions/refresh — best for Sandbox (e.g. user_transactions_dynamic)"
              style={{
                padding: '8px 14px',
                background: syncLoading || linking ? 'rgba(255,255,255,0.04)' : 'rgba(139,92,246,0.12)',
                color: '#a78bfa',
                border: '1px solid rgba(139,92,246,0.25)', borderRadius: C.rs,
                fontSize: '12px', fontWeight: 600,
                cursor: syncLoading || linking ? 'not-allowed' : 'pointer',
                whiteSpace: 'nowrap',
              }}
            >
              Refresh
            </button>
          )}
          <button
            onClick={onOpenPlaid}
            disabled={loadingToken || linking || !ready}
            style={{
              padding: '8px 18px',
              background: (loadingToken || linking || !ready) ? 'rgba(255,255,255,0.08)' : C.brand,
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
        {accountsError && (
          <div style={{ margin: '0 0 12px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
            <p style={{ fontSize: '13px', color: C.danger, margin: 0 }}>{accountsError}</p>
            {accountsErrorCode === 'PLAID_TOKEN_DECRYPT' && onDisconnectBank && (
              <button
                type="button"
                onClick={onDisconnectBank}
                disabled={disconnectLoading}
                style={{
                  alignSelf: 'flex-start',
                  padding: '8px 14px',
                  background: C.danger,
                  color: '#fff',
                  border: 'none',
                  borderRadius: C.rs,
                  fontSize: '12px',
                  fontWeight: 600,
                  cursor: disconnectLoading ? 'not-allowed' : 'pointer',
                  opacity: disconnectLoading ? 0.75 : 1,
                }}
              >
                {disconnectLoading ? 'Removing…' : 'Remove broken bank link'}
              </button>
            )}
          </div>
        )}

        {accountsLoading ? (
          [1, 2].map(i => (
            <div key={i} style={{
              height: 64, borderRadius: C.rs, marginBottom: '8px',
              background: 'linear-gradient(90deg, rgba(255,255,255,0.04) 0%, rgba(255,255,255,0.08) 50%, rgba(255,255,255,0.04) 100%)',
              backgroundSize: '400px 100%',
              animation: 'ff-shimmer 1.4s ease infinite',
            }} />
          ))
        ) : accounts.length === 0 ? (
          <div style={{ padding: '28px 0', textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px' }}>
            <div style={{ fontSize: '36px', lineHeight: 1 }}>🏦</div>
            <div style={{ fontSize: '14px', fontWeight: 600, color: C.ink }}>No accounts connected</div>
            <div style={{ fontSize: '12px', color: C.muted }}>Connect your bank to unlock real insights</div>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {accounts.map((acc, i) => (
              <div key={acc.plaid_account_id || i} style={{
                display: 'flex', alignItems: 'center', gap: '14px',
                padding: '14px 16px', borderRadius: C.rs,
                background: 'rgba(255,255,255,0.04)', border: `1px solid ${C.border}`,
              }}>
                <div style={{
                  width: 36, height: 36, borderRadius: '10px', flexShrink: 0,
                  background: 'rgba(46,204,138,0.12)',
                  border: '1px solid rgba(46,204,138,0.2)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: '18px', lineHeight: 1,
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

        {hasPlaidLinked && onDisconnectBankStepClick && onDisconnectFinalConfirm && !accountsLoading && (
          <div style={{
            marginTop: '18px', paddingTop: '16px',
            borderTop: `1px dashed ${C.border}`,
          }}>
            {disconnectStep < 2 && (
              <button
                type="button"
                onClick={onDisconnectBankStepClick}
                disabled={disconnectLoading || linking || syncLoading}
                style={{
                  padding: '8px 12px',
                  background: disconnectStep === 1 ? 'rgba(248,113,113,0.12)' : 'transparent',
                  color: C.danger,
                  border: `1px solid ${disconnectStep === 1 ? 'rgba(220,38,38,0.45)' : C.border}`,
                  borderRadius: C.rs,
                  fontSize: '12px',
                  fontWeight: 600,
                  cursor: disconnectLoading || linking || syncLoading ? 'not-allowed' : 'pointer',
                  opacity: disconnectLoading ? 0.75 : 1,
                }}
              >
                {disconnectStep === 0 ? 'Disconnect bank (Plaid)' : 'Click again to open confirmation…'}
              </button>
            )}
            {disconnectStep === 1 && (
              <div style={{ fontSize: '11px', color: C.muted, marginTop: '8px', lineHeight: 1.4 }}>
                Or wait — this will reset in a few seconds if you change your mind.
              </div>
            )}
          </div>
        )}

        {disconnectStep === 2 && onDisconnectModalCancel && onDisconnectFinalConfirm && (
          <div
            role="presentation"
            style={{
              position: 'fixed', inset: 0, background: 'rgba(2,5,12,0.75)',
              zIndex: 2000, display: 'flex', alignItems: 'center', justifyContent: 'center',
              padding: '20px',
            }}
            onClick={onDisconnectModalCancel}
            onKeyDown={(e) => e.key === 'Escape' && onDisconnectModalCancel()}
          >
            <div
              role="dialog"
              aria-modal="true"
              aria-labelledby="ff-disconnect-title"
              onClick={(e) => e.stopPropagation()}
              style={{
                maxWidth: 400, width: '100%',
                background: C.surface,
                borderRadius: C.r,
                border: `1px solid ${C.border}`,
                boxShadow: '0 20px 50px rgba(0,0,0,0.18)',
                padding: '22px 22px 18px',
              }}
            >
              <div id="ff-disconnect-title" style={{ fontSize: '16px', fontWeight: 700, color: C.ink, marginBottom: '10px' }}>
                Disconnect bank?
              </div>
              <p style={{ fontSize: '13px', color: C.muted, lineHeight: 1.55, margin: '0 0 18px' }}>
                This removes your Plaid link and deletes Plaid-imported accounts and transactions from FlowFund.
                Your FlowFund Customer Demo manual account (if any) stays. You can reconnect anytime.
              </p>
              <p style={{ fontSize: '12px', fontWeight: 600, color: C.danger, margin: '0 0 18px' }}>
                Click &ldquo;Disconnect bank&rdquo; below one more time to confirm.
              </p>
              <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end', flexWrap: 'wrap' }}>
                <button
                  type="button"
                  onClick={onDisconnectModalCancel}
                  disabled={disconnectLoading}
                  style={{
                    padding: '10px 16px',
                    background: 'transparent',
                    border: `1px solid ${C.border}`,
                    borderRadius: C.rs,
                    fontSize: '13px',
                    fontWeight: 600,
                    color: C.muted,
                    cursor: disconnectLoading ? 'not-allowed' : 'pointer',
                  }}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={onDisconnectFinalConfirm}
                  disabled={disconnectLoading}
                  style={{
                    padding: '10px 16px',
                    background: disconnectLoading ? 'rgba(248,113,113,0.5)' : C.danger,
                    color: '#fff',
                    border: 'none',
                    borderRadius: C.rs,
                    fontSize: '13px',
                    fontWeight: 700,
                    cursor: disconnectLoading ? 'not-allowed' : 'pointer',
                  }}
                >
                  {disconnectLoading ? 'Disconnecting…' : 'Disconnect bank'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── InsightsCard ─────────────────────────────────────────────────────────────
function InsightsCard({ transactions, isDemo, hasBankLink }) {
  const now = new Date();
  const d30 = new Date(now - 30 * 86400000);
  d30.setHours(0, 0, 0, 0);
  const expenses = transactions.filter((t) => {
    if (t.transaction_type !== 'EXPENSE') return false;
    const d = parseTxnDate(t.transaction_date);
    return d && !Number.isNaN(d.getTime()) && d >= d30;
  });
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
            {!hasBankLink
              ? 'No accounts connected. Connect your bank to start.'
              : 'No spending data to display yet'}
          </div>
        ) : cats.map(({ label, amt, pct }) => {
          const { emoji, color } = spendCategoryDisplay(label, false);
          return (
            <div key={label} style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <span style={{ fontSize: '22px', width: '32px', textAlign: 'center', flexShrink: 0, lineHeight: 1 }}>
                {emoji}
              </span>
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
                <div style={{ height: '5px', borderRadius: '3px', background: 'rgba(255,255,255,0.07)', overflow: 'hidden' }}>
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
  const [accountsErrorCode, setAccountsErrorCode] = useState(null);
  const [disconnectLoading, setDisconnectLoading] = useState(false);
  const [disconnectStep, setDisconnectStep] = useState(0);
  const [transactions, setTransactions] = useState([]);
  const [txnLoading, setTxnLoading] = useState(true);
  const [syncLoading, setSyncLoading] = useState(false);
  const [readinessRefresh, setReadinessRefresh] = useState(0);
  const bumpReadiness = useCallback(() => setReadinessRefresh((n) => n + 1), []);
  const [dashTab, setDashTab] = useState('overview');
  const [vw, setVw] = useState(typeof window !== 'undefined' ? window.innerWidth : 1200);

  useEffect(() => {
    const handler = () => setVw(window.innerWidth);
    window.addEventListener('resize', handler);
    return () => window.removeEventListener('resize', handler);
  }, []);
  const isMobile  = vw < 640;
  const isTablet  = vw < 1024;

  const hasPlaidLinked = useMemo(
    () => accounts.some((a) => Boolean(a.plaid_account_id)),
    [accounts]
  );

  useEffect(() => {
    if (disconnectStep !== 1) return undefined;
    const id = setTimeout(() => setDisconnectStep(0), 12000);
    return () => clearTimeout(id);
  }, [disconnectStep]);

  useEffect(() => {
    if (!hasPlaidLinked) setDisconnectStep(0);
  }, [hasPlaidLinked]);

  const onDisconnectBankStepClick = useCallback(() => {
    setDisconnectStep((s) => (s === 0 ? 1 : s === 1 ? 2 : s));
  }, []);

  const fetchAccounts = useCallback(async () => {
    setAccountsLoading(true);
    setAccountsError('');
    setAccountsErrorCode(null);
    const mergeDemoManual = async (plaidList) => {
      const base = [...(plaidList || [])];
      try {
        const { data: dem } = await getDemoCustomerAccounts();
        const plaidKeys = new Set(base.map((a) => a.plaid_account_id).filter(Boolean));
        for (const a of dem.accounts || []) {
          if (!plaidKeys.has(a.plaid_account_id)) base.push(a);
        }
      } catch (_) {}
      return base;
    };
    try {
      const { data } = await getAccounts();
      let merged = await mergeDemoManual(data.accounts || []);
      if (merged.length === 0) {
        try {
          const { data: demOnly } = await getDemoCustomerAccounts();
          merged = demOnly.accounts || [];
        } catch (_) {}
      }
      setAccounts(merged);
    } catch (err) {
      setAccountsError(err.response?.data?.error || 'Failed to load accounts');
      setAccountsErrorCode(err.response?.data?.code || null);
      try {
        const { data: demOnly } = await getDemoCustomerAccounts();
        setAccounts(demOnly.accounts || []);
      } catch (_) {
        setAccounts([]);
      }
    } finally {
      setAccountsLoading(false);
    }
  }, []);

  const fetchTransactions = useCallback(async () => {
    setTxnLoading(true);
    try {
      const { data } = await getTransactions();
      setTransactions(data.transactions || []);
    } catch (_) {
      setTransactions([]);
    } finally {
      setTxnLoading(false);
    }
  }, []);

  const handleDisconnectBank = useCallback(async () => {
    setDisconnectLoading(true);
    try {
      await disconnectPlaidLink();
      setDisconnectStep(0);
      setAccountsError('');
      setAccountsErrorCode(null);
      await fetchAccounts();
      await fetchTransactions();
      bumpReadiness();
    } catch (err) {
      setAccountsError(err.response?.data?.error || 'Could not remove bank link');
    } finally {
      setDisconnectLoading(false);
    }
  }, [fetchAccounts, fetchTransactions, bumpReadiness]);

  const onBankLinked = useCallback(async () => {
    await fetchAccounts();
    await fetchTransactions();
    bumpReadiness();
  }, [fetchAccounts, fetchTransactions, bumpReadiness]);

  const handleSyncFromBank = useCallback(async () => {
    setSyncLoading(true);
    try {
      await syncPlaidFromBank();
      await fetchAccounts();
      await fetchTransactions();
      bumpReadiness();
    } catch (_) {
      /* errors surfaced via accounts/transactions state if needed */
    } finally {
      setSyncLoading(false);
    }
  }, [fetchAccounts, fetchTransactions, bumpReadiness]);

  const handleSandboxRefresh = useCallback(async () => {
    setSyncLoading(true);
    try {
      await sandboxRefreshPlaidTransactions();
      await fetchAccounts();
      await fetchTransactions();
      bumpReadiness();
    } catch (_) {
    } finally {
      setSyncLoading(false);
    }
  }, [fetchAccounts, fetchTransactions, bumpReadiness]);

  const { openPlaid, ready, loadingToken, linking, error: plaidError, successMessage, retryLinkToken } = usePlaidLink(onBankLinked);

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
  d30.setHours(0, 0, 0, 0);
  const expenses30 = transactions.filter((t) => {
    if (t.transaction_type !== 'EXPENSE') return false;
    const d = parseTxnDate(t.transaction_date);
    return d && !Number.isNaN(d.getTime()) && d >= d30;
  });
  const income30 = transactions
    .filter((t) => {
      if (t.transaction_type !== 'INCOME') return false;
      const d = parseTxnDate(t.transaction_date);
      return d && !Number.isNaN(d.getTime()) && d >= d30;
    })
    .reduce((s, t) => s + parseFloat(t.amount || 0), 0);
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
      <div style={{ minHeight: '100vh', background: C.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'DM Sans, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif' }}>
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
      fontFamily: 'DM Sans, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
    }}>
      <AppHeader profile={profile} onLogout={handleLogout} liveData={accounts.length > 0} isDemo={false} />

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
          <StatCard icon="💰" label="Total Balance" value={statsLoading ? null : fmt(totalBalance)} sub={`${accounts.length} account${accounts.length !== 1 ? 's' : ''}`} shimmer={statsLoading} accent />
          <StatCard icon="📊" label="Monthly Spend" value={statsLoading ? null : fmt(monthlySpend)} sub="Last 30 days" valueColor={monthlySpend > 0 ? C.expense : C.ink} shimmer={statsLoading} />
          <StatCard icon="📈" label="Savings Rate" value={statsLoading ? null : (savingsRate !== null ? `${savingsRate}%` : '—')} sub="Of monthly income" valueColor={savingsRate !== null && savingsRate >= 20 ? C.income : C.ink} shimmer={statsLoading} />
          <StatCard icon="🏷️" label="Top Category" value={statsLoading ? null : topCategory} sub="Highest spend" shimmer={statsLoading} />
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

            {/* Dashboard section tabs */}
            <div style={{
              display: 'flex',
              gap: 2,
              background: 'rgba(255,255,255,0.04)',
              border: `1px solid ${C.border}`,
              borderRadius: '12px',
              padding: '4px',
              width: 'fit-content',
            }}>
              {[
                { key: 'overview', label: 'Overview' },
                { key: 'history', label: 'Historical Analysis' },
              ].map(tab => (
                <button
                  key={tab.key}
                  onClick={() => setDashTab(tab.key)}
                  style={{
                    padding: '7px 18px',
                    background: dashTab === tab.key ? C.brand : 'transparent',
                    color: dashTab === tab.key ? '#fff' : C.muted,
                    border: 'none',
                    borderRadius: '9px',
                    fontSize: 12.5, fontWeight: 600,
                    cursor: 'pointer',
                    transition: 'background 0.15s, color 0.15s',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            {dashTab === 'overview' && (
              <>
                <div className="ff-lift">
                  <BankAccountsCard
                    accounts={accounts} accountsLoading={accountsLoading} accountsError={accountsError}
                    accountsErrorCode={accountsErrorCode}
                    successMessage={successMessage} plaidError={plaidError}
                    onOpenPlaid={openPlaid} onRetry={retryLinkToken}
                    loadingToken={loadingToken} linking={linking} ready={ready}
                    onSyncFromBank={handleSyncFromBank}
                    onSandboxRefresh={handleSandboxRefresh}
                    syncLoading={syncLoading}
                    onDisconnectBank={handleDisconnectBank}
                    disconnectLoading={disconnectLoading}
                    hasPlaidLinked={hasPlaidLinked}
                    disconnectStep={disconnectStep}
                    onDisconnectBankStepClick={onDisconnectBankStepClick}
                    onDisconnectModalCancel={() => setDisconnectStep(0)}
                    onDisconnectFinalConfirm={handleDisconnectBank}
                  />
                </div>
                <div className="ff-lift">
                  <TransactionFeed
                    transactions={transactions}
                    isDemo={false}
                    hasBankLink={accounts.length > 0}
                    loading={txnLoading}
                  />
                </div>
                <div className="ff-lift">
                  <InsightsCard transactions={transactions} isDemo={false} hasBankLink={accounts.length > 0} />
                </div>
                {/* Insight cards — 2-col grid on tablet+ */}
                <div style={{
                  display: 'grid',
                  gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr',
                  gap: '24px',
                }}>
                  <div className="ff-lift">
                    <MicroSavingsCard transactions={transactions} hasBankLink={accounts.length > 0} />
                  </div>
                  <div className="ff-lift">
                    <SpendingPersonalityCard transactions={transactions} hasBankLink={accounts.length > 0} />
                  </div>
                </div>
              </>
            )}

            {dashTab === 'history' && <HistoricalAnalysis />}
          </div>

          {/* Right column */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
            <div style={{ position: 'sticky', top: '88px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
              <div className="ff-lift">
                <InvestmentReadinessWidget refreshToken={readinessRefresh} />
              </div>
              <ChatPanel hasLinkedAccounts={accounts.length > 0} />
              <div className="ff-lift">
                <GoalsWidget />
              </div>
              <div className="ff-lift">
                <SimulationsWidget />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
