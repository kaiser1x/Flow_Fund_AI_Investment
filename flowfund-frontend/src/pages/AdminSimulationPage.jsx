import { useState, useCallback, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ADMIN_SIM_UI_PASSWORD,
  saveAdminSimPassword,
  clearAdminSimPassword,
  listTargetAccounts,
  listTargetTransactions,
  plaidSyncTargetUser,
  plaidRefreshTargetUser,
  createDemoCustomerTransaction,
  updateDemoCustomerTransaction,
  deleteDemoCustomerTransaction,
} from '../api/adminSimulation';
import { C } from '../theme/flowfundTheme';

const UNLOCK_KEY = 'ff_admin_sim_unlocked';

export const DEMO_CUSTOMER_EMAIL =
  (import.meta.env.VITE_DEMO_CUSTOMER_EMAIL || 'customer_flowfund@flowfund.demo').trim();

function ymd(d) {
  if (d == null) return '';
  const s = typeof d === 'string' ? d : d.toISOString?.() || String(d);
  return s.slice(0, 10);
}

function isManualLedgerRow(t) {
  return !t.plaid_transaction_id;
}

export default function AdminSimulationPage() {
  const navigate = useNavigate();
  const [unlocked, setUnlocked] = useState(false);
  const [pwInput, setPwInput] = useState('');
  const [pwError, setPwError] = useState('');

  const [targetUserId, setTargetUserId] = useState('');
  const [accounts, setAccounts] = useState([]);
  const [transactions, setTransactions] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  const [accountId, setAccountId] = useState('');
  const [amount, setAmount] = useState('25');
  const [txnType, setTxnType] = useState('EXPENSE');
  const [txnDate, setTxnDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState('General');
  const [merchantName, setMerchantName] = useState('');
  const [editing, setEditing] = useState(null);

  useEffect(() => {
    try {
      if (sessionStorage.getItem(UNLOCK_KEY) === '1' && sessionStorage.getItem('ff_admin_sim_password')) {
        setUnlocked(true);
      }
    } catch (_) {}
  }, []);

  const tryUnlock = (e) => {
    e?.preventDefault();
    setPwError('');
    if (pwInput !== ADMIN_SIM_UI_PASSWORD) {
      setPwError('Incorrect password.');
      return;
    }
    saveAdminSimPassword(pwInput);
    try {
      sessionStorage.setItem(UNLOCK_KEY, '1');
    } catch (_) {}
    setUnlocked(true);
    setPwInput('');
  };

  const lockAgain = () => {
    clearAdminSimPassword();
    try {
      sessionStorage.removeItem(UNLOCK_KEY);
    } catch (_) {}
    setUnlocked(false);
    setAccounts([]);
    setTransactions([]);
  };

  const uid = parseInt(targetUserId, 10);
  const manualAccounts = accounts.filter((a) => !a.plaid_account_id);

  const load = useCallback(async () => {
    if (!Number.isFinite(uid) || uid < 1) {
      setError('Enter a valid FlowFund user_id (use the customer_flowfund account’s user id).');
      return;
    }
    setLoading(true);
    setError('');
    setMessage('');
    try {
      // Accounts first: backend runs idempotent demo seed for customer_flowfund@ email before returning rows.
      const { data: a } = await listTargetAccounts(uid);
      const accList = a.accounts || [];
      setAccounts(accList);
      const { data: t } = await listTargetTransactions(uid, 80);
      setTransactions(t.transactions || []);
      const manual = accList.filter((x) => !x.plaid_account_id);
      if (manual.length) setAccountId(String(manual[0].account_id));
      setMessage('Loaded accounts and transactions (manual demo + Plaid-imported).');
    } catch (e) {
      setAccounts([]);
      setTransactions([]);
      setError(e.response?.data?.error || e.message || 'Request failed');
    } finally {
      setLoading(false);
    }
  }, [uid]);

  const runSync = async () => {
    if (!Number.isFinite(uid) || uid < 1) return;
    setLoading(true);
    setError('');
    setMessage('');
    try {
      const { data } = await plaidSyncTargetUser(uid);
      setMessage(data.message || 'Sync complete.');
      await load();
    } catch (e) {
      setError(e.response?.data?.error || e.response?.data?.detail || e.message);
    } finally {
      setLoading(false);
    }
  };

  const runRefresh = async () => {
    if (!Number.isFinite(uid) || uid < 1) return;
    setLoading(true);
    setError('');
    setMessage('');
    try {
      const { data } = await plaidRefreshTargetUser(uid);
      const errs = data.refresh_errors?.filter(Boolean);
      setMessage(
        (data.message || 'Refresh complete.') + (errs?.length ? ` Warnings: ${errs.join('; ')}` : '')
      );
      await load();
    } catch (e) {
      setError(e.response?.data?.error || e.response?.data?.detail || e.message);
    } finally {
      setLoading(false);
    }
  };

  const addTxn = async () => {
    if (!Number.isFinite(uid) || uid < 1) return;
    setLoading(true);
    setError('');
    setMessage('');
    try {
      await createDemoCustomerTransaction(uid, {
        account_id: parseInt(accountId, 10),
        amount: parseFloat(amount),
        transaction_type: txnType,
        transaction_date: txnDate,
        description: description || undefined,
        category: category || undefined,
        merchant_name: merchantName || undefined,
      });
      setMessage('Added to FlowFund Customer Demo ledger (metrics + alerts updated).');
      await load();
    } catch (e) {
      setError(e.response?.data?.error || e.message);
    } finally {
      setLoading(false);
    }
  };

  const saveEdit = async () => {
    if (!editing) return;
    setLoading(true);
    setError('');
    setMessage('');
    try {
      await updateDemoCustomerTransaction(editing.transaction_id, {
        user_id: uid,
        amount: parseFloat(editing.amount),
        transaction_type: editing.transaction_type,
        transaction_date: ymd(editing.transaction_date),
        description: editing.description,
        category: editing.category,
        merchant_name: editing.merchant_name || null,
      });
      setEditing(null);
      setMessage('Updated manual/demo row.');
      await load();
    } catch (e) {
      setError(e.response?.data?.error || e.message);
    } finally {
      setLoading(false);
    }
  };

  const removeTxn = async (txnId) => {
    if (!window.confirm('Delete this manual/demo transaction?')) return;
    setLoading(true);
    setError('');
    try {
      await deleteDemoCustomerTransaction(txnId, uid);
      setMessage('Deleted.');
      await load();
    } catch (e) {
      setError(e.response?.data?.error || e.message);
    } finally {
      setLoading(false);
    }
  };

  if (!unlocked) {
    return (
      <div
        style={{
          minHeight: '100vh',
          background: '#0f172a',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: 24,
          fontFamily: 'system-ui, sans-serif',
        }}
      >
        <form
          onSubmit={tryUnlock}
          style={{
            width: '100%',
            maxWidth: 360,
            padding: 28,
            borderRadius: 12,
            background: '#1e293b',
            border: '1px solid #334155',
          }}
        >
          <h1 style={{ margin: '0 0 8px', fontSize: 18, color: '#f8fafc' }}>Admin simulation</h1>
          <p style={{ margin: '0 0 20px', fontSize: 13, color: '#94a3b8', lineHeight: 1.5 }}>
            Password-protected tools for the <code style={{ color: '#a5b4fc' }}>customer_flowfund</code> demo account.
          </p>
          <input
            type="password"
            value={pwInput}
            onChange={(e) => setPwInput(e.target.value)}
            placeholder="Password"
            autoComplete="off"
            style={{
              width: '100%',
              boxSizing: 'border-box',
              padding: '12px 14px',
              borderRadius: 8,
              border: '1px solid #475569',
              background: '#0f172a',
              color: '#f1f5f9',
              marginBottom: 12,
            }}
          />
          {pwError && <div style={{ color: '#f87171', fontSize: 13, marginBottom: 12 }}>{pwError}</div>}
          <button type="submit" style={unlockBtn}>
            Unlock
          </button>
          <button type="button" onClick={() => navigate('/dashboard')} style={backBtn}>
            Back to dashboard
          </button>
        </form>
      </div>
    );
  }

  return (
    <div
      style={{
        minHeight: '100vh',
        background: '#0f172a',
        color: '#e2e8f0',
        fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
        fontSize: 13,
        padding: '24px 20px 48px',
      }}
    >
      <div style={{ maxWidth: 960, margin: '0 auto' }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginBottom: 20, alignItems: 'center' }}>
          <button type="button" onClick={() => navigate('/dashboard')} style={btnGhost}>
            ← Dashboard
          </button>
          <button type="button" onClick={lockAgain} style={btnGhost}>
            Lock
          </button>
        </div>

        <h1 style={{ fontSize: 18, fontWeight: 700, margin: '0 0 8px', color: '#f8fafc' }}>
          Admin simulation — customer_flowfund
        </h1>
        <p style={{ margin: '0 0 12px', color: '#94a3b8', lineHeight: 1.55, maxWidth: 860 }}>
          Register/login as <strong>{DEMO_CUSTOMER_EMAIL}</strong> to get a pre-seeded <strong>FlowFund Customer Demo</strong>{' '}
          checking account plus Plaid data after you link Sandbox. <strong>Add / edit / delete</strong> here only affects that
          manual demo ledger (not rows imported from Plaid). <strong>Sync from Plaid</strong> and <strong>Sandbox refresh</strong>{' '}
          pull institution data through the normal pipeline so readiness, notifications, and chat stay aligned with Plaid.
        </p>

        <div style={{ ...card, marginBottom: 16 }}>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'flex-end' }}>
            <div>
              <label style={label}>Target user_id</label>
              <input
                value={targetUserId}
                onChange={(e) => setTargetUserId(e.target.value.replace(/\D/g, ''))}
                placeholder="customer_flowfund user id"
                style={input}
              />
            </div>
            <button type="button" disabled={loading} onClick={load} style={btnPrimary}>
              Load
            </button>
            <button type="button" disabled={loading} onClick={runSync} style={btnIndigo}>
              Sync from Plaid
            </button>
            <button type="button" disabled={loading} onClick={runRefresh} style={btnPurple}>
              Sandbox refresh
            </button>
          </div>
        </div>

        {error && <div style={bannerErr}>{error}</div>}
        {message && !error && <div style={bannerOk}>{message}</div>}
        {message && !error && manualAccounts.length === 0 && (
          <div style={bannerWarn}>
            <strong>No manual “FlowFund Customer Demo” account for this user_id.</strong> The green{' '}
            <strong>Add transaction</strong> form only appears when there is a checking account without Plaid. That
            account is auto-created on <strong>Load</strong> only if this user’s email is exactly{' '}
            <code style={{ color: '#fde68a' }}>{DEMO_CUSTOMER_EMAIL}</code>. Register or fix the email in MySQL, then
            click <strong>Load</strong> again. Plaid-only users: change Sandbox data and use Sync — those rows are not
            editable here.
          </div>
        )}

        {manualAccounts.length > 0 && (
          <div style={{ ...card, marginBottom: 16 }}>
            <div style={{ fontWeight: 600, color: '#cbd5e1', marginBottom: 10 }}>
              Add transaction (demo customer only — manual account)
            </div>
            <div style={{ display: 'grid', gap: 10, gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))' }}>
              <select
                value={accountId}
                onChange={(e) => setAccountId(e.target.value)}
                style={inp}
              >
                {manualAccounts.map((a) => (
                  <option key={a.account_id} value={a.account_id}>
                    #{a.account_id} {a.bank_name?.slice(0, 22)}
                  </option>
                ))}
              </select>
              <select value={txnType} onChange={(e) => setTxnType(e.target.value)} style={inp}>
                <option value="EXPENSE">EXPENSE</option>
                <option value="INCOME">INCOME</option>
              </select>
              <input type="number" value={amount} onChange={(e) => setAmount(e.target.value)} style={inp} />
              <input type="date" value={txnDate} onChange={(e) => setTxnDate(e.target.value)} style={inp} />
              <input value={category} onChange={(e) => setCategory(e.target.value)} placeholder="Category" style={inp} />
              <input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Description" style={inp} />
              <input value={merchantName} onChange={(e) => setMerchantName(e.target.value)} placeholder="Merchant" style={inp} />
            </div>
            <button type="button" disabled={loading || !accountId} onClick={addTxn} style={{ ...btnPrimary, marginTop: 12 }}>
              Add transaction
            </button>
          </div>
        )}

        {accounts.length > 0 && (
          <div style={{ ...card, marginBottom: 16 }}>
            <div style={{ fontWeight: 600, color: '#cbd5e1', marginBottom: 10 }}>Accounts ({accounts.length})</div>
            <ul style={{ margin: 0, paddingLeft: 18, color: '#94a3b8' }}>
              {accounts.map((a) => (
                <li key={a.account_id}>
                  #{a.account_id} {a.bank_name} · {a.account_type} · ${Number(a.balance).toFixed(2)}
                  {a.plaid_account_id ? ` · Plaid …${String(a.plaid_account_id).slice(-6)}` : ' · manual demo'}
                </li>
              ))}
            </ul>
          </div>
        )}

        <div style={card}>
          <div style={{ fontWeight: 600, color: '#cbd5e1', marginBottom: 10 }}>
            Transactions ({transactions.length})
          </div>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ color: '#64748b', fontSize: 11, textAlign: 'left' }}>
                  <th style={th}>id</th>
                  <th style={th}>src</th>
                  <th style={th}>plaid id</th>
                  <th style={th}>date</th>
                  <th style={th}>type</th>
                  <th style={th}>amt</th>
                  <th style={th}>category</th>
                  <th style={th}>description</th>
                  <th style={th} />
                </tr>
              </thead>
              <tbody>
                {transactions.map((t) => (
                  <tr key={t.transaction_id} style={{ borderTop: '1px solid #334155' }}>
                    <td style={td}>{t.transaction_id}</td>
                    <td style={td}>{t.source}</td>
                    <td style={{ ...td, maxWidth: 80 }} title={t.plaid_transaction_id}>
                      {t.plaid_transaction_id ? `${String(t.plaid_transaction_id).slice(0, 8)}…` : '—'}
                    </td>
                    <td style={td}>{ymd(t.transaction_date)}</td>
                    <td style={td}>{t.transaction_type}</td>
                    <td style={td}>{Number(t.amount).toFixed(2)}</td>
                    <td style={td}>{t.category}</td>
                    <td style={{ ...td, maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis' }} title={t.description}>
                      {t.description}
                    </td>
                    <td style={td}>
                      {isManualLedgerRow(t) ? (
                        <>
                          <button type="button" onClick={() => setEditing({ ...t })} style={btnSm}>
                            Edit
                          </button>
                          <button type="button" onClick={() => removeTxn(t.transaction_id)} style={{ ...btnSm, marginLeft: 6, color: '#f87171' }}>
                            Del
                          </button>
                        </>
                      ) : (
                        <span style={{ color: '#475569' }}>Plaid</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {editing && (
          <div style={modalOverlay}>
            <div style={modalBox}>
              <h3 style={{ margin: '0 0 14px', fontSize: 15 }}>Edit manual row #{editing.transaction_id}</h3>
              <div style={{ display: 'grid', gap: 10 }}>
                <select
                  value={editing.transaction_type}
                  onChange={(e) => setEditing({ ...editing, transaction_type: e.target.value })}
                  style={inpFull}
                >
                  <option value="EXPENSE">EXPENSE</option>
                  <option value="INCOME">INCOME</option>
                </select>
                <input
                  type="number"
                  value={editing.amount}
                  onChange={(e) => setEditing({ ...editing, amount: e.target.value })}
                  style={inpFull}
                />
                <input
                  type="date"
                  value={ymd(editing.transaction_date)}
                  onChange={(e) => setEditing({ ...editing, transaction_date: e.target.value })}
                  style={inpFull}
                />
                <input
                  value={editing.category || ''}
                  onChange={(e) => setEditing({ ...editing, category: e.target.value })}
                  style={inpFull}
                  placeholder="Category"
                />
                <input
                  value={editing.description || ''}
                  onChange={(e) => setEditing({ ...editing, description: e.target.value })}
                  style={inpFull}
                  placeholder="Description"
                />
                <input
                  value={editing.merchant_name || ''}
                  onChange={(e) => setEditing({ ...editing, merchant_name: e.target.value })}
                  style={inpFull}
                  placeholder="Merchant"
                />
              </div>
              <div style={{ marginTop: 16, display: 'flex', gap: 10 }}>
                <button type="button" onClick={saveEdit} disabled={loading} style={{ ...btnPrimary, flex: 1 }}>
                  Save
                </button>
                <button type="button" onClick={() => setEditing(null)} style={{ ...btnGhost, flex: 1, border: '1px solid #475569' }}>
                  Cancel
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

const unlockBtn = {
  width: '100%',
  padding: '12px 16px',
  borderRadius: 8,
  border: 'none',
  background: C.brand,
  color: '#fff',
  fontWeight: 700,
  cursor: 'pointer',
};
const backBtn = {
  marginTop: 12,
  width: '100%',
  padding: '10px',
  background: 'transparent',
  border: 'none',
  color: '#64748b',
  cursor: 'pointer',
  fontSize: 13,
};

const card = {
  border: '1px solid #334155',
  borderRadius: 8,
  padding: 16,
  background: '#1e293b',
};

const label = { display: 'block', color: '#94a3b8', marginBottom: 4, fontSize: 11 };
const input = {
  width: 120,
  padding: '8px 10px',
  borderRadius: 6,
  border: '1px solid #475569',
  background: '#0f172a',
  color: '#f1f5f9',
};
const inp = { ...input, minWidth: 0 };
const inpFull = { ...input, width: '100%', boxSizing: 'border-box' };

const btnPrimary = {
  padding: '8px 14px',
  borderRadius: 6,
  border: 'none',
  background: C.brand,
  color: '#fff',
  fontWeight: 600,
  cursor: 'pointer',
};
const btnIndigo = { ...btnPrimary, background: '#4f46e5' };
const btnPurple = { ...btnPrimary, background: '#7c3aed' };
const btnGhost = {
  padding: '6px 12px',
  borderRadius: 6,
  border: '1px solid #334155',
  background: 'transparent',
  color: '#94a3b8',
  cursor: 'pointer',
};

const th = { padding: '8px 6px' };
const td = { padding: '8px 6px', verticalAlign: 'top' };
const btnSm = {
  background: 'transparent',
  border: '1px solid #475569',
  color: '#94a3b8',
  borderRadius: 4,
  padding: '2px 6px',
  fontSize: 11,
  cursor: 'pointer',
};

const bannerErr = {
  padding: 12,
  borderRadius: 6,
  background: 'rgba(239,68,68,0.15)',
  color: '#fca5a5',
  marginBottom: 12,
};
const bannerOk = {
  padding: 12,
  borderRadius: 6,
  background: 'rgba(34,197,94,0.12)',
  color: '#86efac',
  marginBottom: 12,
};
const bannerWarn = {
  padding: 12,
  borderRadius: 6,
  background: 'rgba(245,158,11,0.12)',
  border: '1px solid rgba(245,158,11,0.35)',
  color: '#fcd34d',
  marginBottom: 12,
  fontSize: 12,
  lineHeight: 1.5,
};

const modalOverlay = {
  position: 'fixed',
  inset: 0,
  background: 'rgba(0,0,0,0.65)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: 16,
  zIndex: 300,
};
const modalBox = {
  background: '#1e293b',
  border: '1px solid #475569',
  borderRadius: 10,
  padding: 20,
  maxWidth: 400,
  width: '100%',
};
