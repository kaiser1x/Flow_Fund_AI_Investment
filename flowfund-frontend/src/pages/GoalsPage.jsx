import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { getGoals, getGoalsInsights, createGoal, updateGoal, deleteGoal } from '../api/goals';
import { getProfile, logout as logoutApi } from '../api/auth';
import AppHeader from '../components/AppHeader';
import { C } from '../theme/flowfundTheme';

// ── Constants ─────────────────────────────────────────────────────────────────
const STATUS_COLOR  = { green: '#34d399', yellow: '#fbbf24', red: '#f87171' };
const STATUS_BG     = { green: 'rgba(22,163,74,0.08)', yellow: 'rgba(217,119,6,0.08)', red: 'rgba(220,38,38,0.07)' };
const TYPE_ICON     = { savings: '🏦', debt_payoff: '💳', spending_limit: '📊', investment_target: '📈' };
const TYPE_LABEL    = { savings: 'Savings', debt_payoff: 'Debt Payoff', spending_limit: 'Spending Limit', investment_target: 'Investment Target' };
const TREND_ICON    = { up: '↑', down: '↓', stable: '→' };
const TREND_COLOR   = { up: C.expense, down: C.success, stable: C.muted };

const EMPTY_FORM = {
  name: '', type: 'savings', target_amount: '', current_amount: '',
  target_date: '', notes: '', auto_track: false,
};

// ── Helpers ───────────────────────────────────────────────────────────────────
const fmt    = n => '$' + parseFloat(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtInt = n => '$' + parseFloat(n || 0).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 });

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

function minFutureDate() {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return d.toISOString().slice(0, 10);
}

// ── Sub-components ────────────────────────────────────────────────────────────
function ProgressBar({ pct, color }) {
  return (
    <div style={{ height: 7, borderRadius: 99, background: 'rgba(255,255,255,0.08)', overflow: 'hidden' }}>
      <div style={{
        height: '100%', width: `${Math.min(100, pct)}%`,
        background: color, borderRadius: 99, transition: 'width 0.4s ease',
      }} />
    </div>
  );
}

function SummaryBadge({ label, value, color }) {
  return (
    <div style={{
      background: C.surface, borderRadius: C.rs, border: `1px solid ${C.border}`,
      padding: '12px 16px', flex: 1, minWidth: 100,
    }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: C.faint, textTransform: 'uppercase', letterSpacing: '0.07em' }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 800, color: color || C.ink, marginTop: 4 }}>{value}</div>
    </div>
  );
}

function GoalCard({ goal, onEdit, onDelete }) {
  const color  = STATUS_COLOR[goal.status_color] || C.muted;
  const bg     = STATUS_BG[goal.status_color]    || 'transparent';
  const icon   = TYPE_ICON[goal.type]  || '🎯';
  const label  = TYPE_LABEL[goal.type] || goal.type;
  const daysLeft = Math.ceil((new Date(goal.target_date) - new Date()) / 86400000);

  return (
    <div style={{
      background: C.surface, borderRadius: C.r,
      border: `1px solid ${C.border}`, boxShadow: C.shadowSm,
      overflow: 'hidden',
    }}>
      <div style={{ height: 3, background: color }} />
      <div style={{ padding: '18px 20px' }}>
        {/* Top row */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 20 }}>{icon}</span>
            <div>
              <div style={{ fontSize: 15, fontWeight: 700, color: C.ink }}>{goal.name}</div>
              <div style={{ fontSize: 11, color: C.muted, marginTop: 1 }}>{label}</div>
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{
              fontSize: 10, fontWeight: 700, color,
              background: bg, border: `1px solid ${color}33`,
              borderRadius: 20, padding: '2px 8px',
            }}>
              {goal.status_label}
            </span>
          </div>
        </div>

        {/* Progress */}
        <div style={{ marginBottom: 10 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: C.muted, marginBottom: 5 }}>
            <span>{fmt(goal.current_amount)} of {fmt(goal.target_amount)}</span>
            <span style={{ fontWeight: 700, color }}>{goal.progress_pct}%</span>
          </div>
          <ProgressBar pct={goal.progress_pct} color={color} />
        </div>

        {/* Meta row */}
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: C.faint, marginBottom: 12 }}>
          <span>
            {daysLeft > 0 ? `${daysLeft} days left` : 'Deadline passed'}
            {' · '}{new Date(goal.target_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
          </span>
          {goal.auto_track && <span style={{ color: C.success, fontWeight: 600 }}>Auto-tracked</span>}
        </div>

        {goal.notes && (
          <div style={{
            fontSize: 12, color: C.muted, lineHeight: 1.5,
            background: 'rgba(255,255,255,0.04)', borderRadius: C.rs,
            padding: '8px 12px', marginBottom: 12,
          }}>
            {goal.notes}
          </div>
        )}

        {/* Actions */}
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            onClick={() => onEdit(goal)}
            style={{
              flex: 1, padding: '7px 0',
              background: 'transparent', border: `1px solid ${C.border}`,
              borderRadius: C.rs, fontSize: 12, fontWeight: 600,
              color: C.ink, cursor: 'pointer',
            }}
            onMouseEnter={e => { e.currentTarget.style.borderColor = C.brand; e.currentTarget.style.color = C.brand; }}
            onMouseLeave={e => { e.currentTarget.style.borderColor = C.border; e.currentTarget.style.color = C.ink; }}
          >
            Edit
          </button>
          <button
            onClick={() => onDelete(goal)}
            style={{
              flex: 1, padding: '7px 0',
              background: 'transparent', border: `1px solid rgba(220,38,38,0.2)`,
              borderRadius: C.rs, fontSize: 12, fontWeight: 600,
              color: C.danger, cursor: 'pointer',
            }}
            onMouseEnter={e => { e.currentTarget.style.background = 'rgba(220,38,38,0.06)'; }}
            onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}
          >
            Delete
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Goal Form Modal ───────────────────────────────────────────────────────────
function GoalFormModal({ initial, onSave, onClose, saving }) {
  const [form, setForm]     = useState(initial || EMPTY_FORM);
  const [errors, setErrors] = useState({});

  function set(field, value) {
    setForm(f => ({ ...f, [field]: value }));
    setErrors(e => ({ ...e, [field]: undefined }));
  }

  function validate() {
    const errs = {};
    if (!form.name.trim()) errs.name = 'Goal name is required.';
    else if (form.name.trim().length > 100) errs.name = 'Max 100 characters.';
    if (!form.target_amount || parseFloat(form.target_amount) <= 0) errs.target_amount = 'Must be a positive number.';
    if (form.current_amount && parseFloat(form.current_amount) < 0) errs.current_amount = 'Must be zero or positive.';
    if (!form.target_date) errs.target_date = 'Target date is required.';
    else if (form.target_date <= todayStr()) errs.target_date = 'Must be a future date.';
    if (form.notes && form.notes.length > 500) errs.notes = 'Max 500 characters.';
    return errs;
  }

  function handleSubmit(e) {
    e.preventDefault();
    const errs = validate();
    if (Object.keys(errs).length > 0) { setErrors(errs); return; }
    onSave(form);
  }

  const inputStyle = (err) => ({
    width: '100%', padding: '9px 12px',
    border: `1px solid ${err ? C.danger : C.border}`,
    borderRadius: C.rs, fontSize: 13, color: C.ink,
    background: 'rgba(255,255,255,0.05)', outline: 'none', boxSizing: 'border-box', color: 'inherit',
  });

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 200,
      background: 'rgba(2,5,12,0.75)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: '16px',
    }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div style={{
        background: C.surface, borderRadius: C.r,
        border: `1px solid ${C.border}`, boxShadow: C.shadow,
        width: '100%', maxWidth: 480,
        maxHeight: '90vh', overflowY: 'auto',
      }}>
        <div style={{ padding: '20px 24px', borderBottom: `1px solid ${C.border}` }}>
          <div style={{ fontSize: 17, fontWeight: 800, color: C.ink }}>
            {initial ? 'Edit Goal' : 'Add New Goal'}
          </div>
        </div>

        <form onSubmit={handleSubmit} style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 14 }}>

          {/* Name */}
          <div>
            <label style={{ fontSize: 12, fontWeight: 600, color: C.muted, display: 'block', marginBottom: 5 }}>
              Goal Name <span style={{ color: C.danger }}>*</span>
            </label>
            <input
              value={form.name}
              onChange={e => set('name', e.target.value)}
              placeholder="e.g. Emergency Fund"
              style={inputStyle(errors.name)}
              maxLength={100}
            />
            {errors.name && <div style={{ fontSize: 11, color: C.danger, marginTop: 3 }}>{errors.name}</div>}
          </div>

          {/* Type */}
          <div>
            <label style={{ fontSize: 12, fontWeight: 600, color: C.muted, display: 'block', marginBottom: 5 }}>
              Goal Type <span style={{ color: C.danger }}>*</span>
            </label>
            <select
              value={form.type}
              onChange={e => set('type', e.target.value)}
              style={{ ...inputStyle(false), cursor: 'pointer' }}
            >
              <option value="savings">Savings</option>
              <option value="debt_payoff">Debt Payoff</option>
              <option value="spending_limit">Spending Limit</option>
              <option value="investment_target">Investment Target</option>
            </select>
          </div>

          {/* Target + Current */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div>
              <label style={{ fontSize: 12, fontWeight: 600, color: C.muted, display: 'block', marginBottom: 5 }}>
                Target Amount ($) <span style={{ color: C.danger }}>*</span>
              </label>
              <input
                type="number" min="0.01" step="0.01"
                value={form.target_amount}
                onChange={e => set('target_amount', e.target.value)}
                placeholder="5000"
                style={inputStyle(errors.target_amount)}
              />
              {errors.target_amount && <div style={{ fontSize: 11, color: C.danger, marginTop: 3 }}>{errors.target_amount}</div>}
            </div>
            <div>
              <label style={{ fontSize: 12, fontWeight: 600, color: C.muted, display: 'block', marginBottom: 5 }}>
                Current Progress ($)
              </label>
              <input
                type="number" min="0" step="0.01"
                value={form.current_amount}
                onChange={e => set('current_amount', e.target.value)}
                placeholder="0"
                style={inputStyle(errors.current_amount)}
              />
              {errors.current_amount && <div style={{ fontSize: 11, color: C.danger, marginTop: 3 }}>{errors.current_amount}</div>}
            </div>
          </div>

          {/* Target Date */}
          <div>
            <label style={{ fontSize: 12, fontWeight: 600, color: C.muted, display: 'block', marginBottom: 5 }}>
              Target Date <span style={{ color: C.danger }}>*</span>
            </label>
            <input
              type="date"
              value={form.target_date}
              min={minFutureDate()}
              onChange={e => set('target_date', e.target.value)}
              style={inputStyle(errors.target_date)}
            />
            {errors.target_date && <div style={{ fontSize: 11, color: C.danger, marginTop: 3 }}>{errors.target_date}</div>}
          </div>

          {/* Auto-track */}
          {(form.type === 'savings' || form.type === 'spending_limit') && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <input
                type="checkbox"
                id="auto_track"
                checked={!!form.auto_track}
                onChange={e => set('auto_track', e.target.checked)}
                style={{ width: 14, height: 14, cursor: 'pointer' }}
              />
              <label htmlFor="auto_track" style={{ fontSize: 12, color: C.muted, cursor: 'pointer' }}>
                Auto-track from account data
                {form.type === 'savings' && ' (uses total balance)'}
                {form.type === 'spending_limit' && ' (uses last 30 days spending)'}
              </label>
            </div>
          )}

          {/* Notes */}
          <div>
            <label style={{ fontSize: 12, fontWeight: 600, color: C.muted, display: 'block', marginBottom: 5 }}>Notes</label>
            <textarea
              value={form.notes}
              onChange={e => set('notes', e.target.value)}
              placeholder="Optional notes about this goal…"
              rows={2}
              maxLength={500}
              style={{ ...inputStyle(errors.notes), resize: 'vertical', fontFamily: 'inherit' }}
            />
            {errors.notes && <div style={{ fontSize: 11, color: C.danger, marginTop: 3 }}>{errors.notes}</div>}
          </div>

          {/* Actions */}
          <div style={{ display: 'flex', gap: 10, paddingTop: 4 }}>
            <button
              type="button" onClick={onClose}
              style={{
                flex: 1, padding: '10px 0',
                background: 'transparent', border: `1px solid ${C.border}`,
                borderRadius: C.rs, fontSize: 13, fontWeight: 600, color: C.muted, cursor: 'pointer',
              }}
            >
              Cancel
            </button>
            <button
              type="submit" disabled={saving}
              style={{
                flex: 2, padding: '10px 0',
                background: saving ? '#dde4e1' : C.brand, color: saving ? C.faint : '#fff',
                border: 'none', borderRadius: C.rs, fontSize: 13, fontWeight: 600,
                cursor: saving ? 'not-allowed' : 'pointer',
              }}
            >
              {saving ? 'Saving…' : (initial ? 'Save Changes' : 'Create Goal')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Growth Insights Panel ─────────────────────────────────────────────────────
function GrowthInsightsPanel() {
  const [insights, setInsights] = useState(null);
  const [loading,  setLoading]  = useState(true);

  useEffect(() => {
    getGoalsInsights()
      .then(({ data: d }) => setInsights(d))
      .catch(() => setInsights(null))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div style={{
        background: C.surface, borderRadius: C.r,
        border: `1px solid ${C.border}`, boxShadow: C.shadowSm,
        padding: '20px 24px',
      }}>
        {[100, 80, 90].map((w, i) => (
          <div key={i} style={{
            height: 14, borderRadius: 6, width: `${w}%`, marginBottom: 10,
            background: 'linear-gradient(90deg, #e8ede9 0%, #d4ddd8 50%, #e8ede9 100%)',
            backgroundSize: '400px 100%', animation: 'ff-shimmer 1.4s ease infinite',
          }} />
        ))}
      </div>
    );
  }

  if (!insights) return null;

  const spendColor   = TREND_COLOR[insights.spending_trend] || C.muted;
  const balColor     = TREND_COLOR[insights.balance_trend === 'up' ? 'down' : insights.balance_trend === 'down' ? 'up' : 'stable'] || C.muted;
  const spendIcon    = TREND_ICON[insights.spending_trend]  || '→';
  const balIcon      = TREND_ICON[insights.balance_trend]   || '→';

  return (
    <div style={{
      background: C.surface, borderRadius: C.r,
      border: `1px solid ${C.border}`, boxShadow: C.shadowSm,
      overflow: 'hidden',
    }}>
      <div style={{ padding: '16px 24px', borderBottom: `1px solid ${C.border}` }}>
        <div style={{ fontSize: 15, fontWeight: 700, color: C.ink }}>Growth Insights</div>
        <div style={{ fontSize: 12, color: C.muted, marginTop: 2 }}>Your financial direction this month</div>
      </div>
      <div style={{ padding: '18px 24px' }}>
        {/* Trend indicators */}
        <div style={{ display: 'flex', gap: 12, marginBottom: 16 }}>
          <div style={{
            flex: 1, padding: '12px 16px', borderRadius: C.rs,
            background: spendColor + '0d', border: `1px solid ${spendColor}30`,
          }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: C.faint, textTransform: 'uppercase', letterSpacing: '0.07em' }}>Spending</div>
            <div style={{ fontSize: 20, fontWeight: 800, color: spendColor, marginTop: 4 }}>
              {spendIcon} {insights.spending_trend.charAt(0).toUpperCase() + insights.spending_trend.slice(1)}
            </div>
          </div>
          <div style={{
            flex: 1, padding: '12px 16px', borderRadius: C.rs,
            background: (insights.balance_trend === 'up' ? C.success : insights.balance_trend === 'down' ? C.danger : C.muted) + '0d',
            border: `1px solid ${(insights.balance_trend === 'up' ? C.success : insights.balance_trend === 'down' ? C.danger : C.muted)}30`,
          }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: C.faint, textTransform: 'uppercase', letterSpacing: '0.07em' }}>Balance</div>
            <div style={{ fontSize: 20, fontWeight: 800, color: insights.balance_trend === 'up' ? C.success : insights.balance_trend === 'down' ? C.danger : C.muted, marginTop: 4 }}>
              {balIcon} {insights.balance_trend.charAt(0).toUpperCase() + insights.balance_trend.slice(1)}
            </div>
          </div>
        </div>

        {/* Summary paragraph */}
        <p style={{ margin: 0, fontSize: 13, color: C.ink, lineHeight: 1.7 }}>
          {insights.summary}
        </p>
      </div>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────
export default function GoalsPage() {
  const navigate = useNavigate();
  const [profile, setProfile] = useState(null);
  const [goals,    setGoals]   = useState([]);
  const [loading,  setLoading] = useState(true);
  const [filter,   setFilter]  = useState('all');
  const [showModal, setShowModal] = useState(false);
  const [editGoal,  setEditGoal]  = useState(null);  // null = create, goal = edit
  const [saving,    setSaving]    = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [isDemo,    setIsDemo]   = useState(false);
  const [error,     setError]    = useState(null);

  const loadGoals = useCallback(async (f = filter) => {
    setLoading(true);
    try {
      const { data } = await getGoals(f);
      setGoals(data.goals || []);
      setIsDemo(data.source === 'demo');
    } catch {
      setError('Could not load goals.');
    } finally {
      setLoading(false);
    }
  }, [filter]);

  useEffect(() => {
    getProfile().then(r => setProfile(r.data)).catch(() => {});
    loadGoals('all');
  }, []);

  const handleFilterChange = (f) => {
    setFilter(f);
    loadGoals(f);
  };

  const handleLogout = async () => {
    try { await logoutApi(); } catch (_) {}
    localStorage.removeItem('token');
    navigate('/login');
  };

  const openCreate = () => { setEditGoal(null); setShowModal(true); };
  const openEdit   = (goal) => {
    setEditGoal({
      ...EMPTY_FORM,
      name: goal.name,
      type: goal.type,
      target_amount: String(goal.target_amount),
      current_amount: String(goal.current_amount),
      target_date: goal.target_date
        ? (typeof goal.target_date === 'string' ? goal.target_date.slice(0, 10) : new Date(goal.target_date).toISOString().slice(0, 10))
        : '',
      notes: goal.notes || '',
      auto_track: !!goal.auto_track,
      _id: goal.goal_id,
    });
    setShowModal(true);
  };

  const handleSave = async (form) => {
    setSaving(true);
    try {
      const payload = {
        name: form.name, type: form.type,
        target_amount: parseFloat(form.target_amount),
        current_amount: parseFloat(form.current_amount) || 0,
        target_date: form.target_date,
        notes: form.notes || '',
        auto_track: !!form.auto_track,
      };

      // Treat edits of demo placeholder goals (id starts with 'demo-') as creates
      const isRealEdit = form._id && !String(form._id).startsWith('demo-');

      if (isRealEdit) {
        const { data } = await updateGoal(form._id, payload);
        setGoals(gs => gs.map(g => g.goal_id === form._id ? data.goal : g));
      } else {
        const { data } = await createGoal(payload);
        // Drop demo placeholders when the first real goal is saved
        setGoals(gs => {
          const realGoals = gs.filter(g => !String(g.goal_id).startsWith('demo-'));
          return [data.goal, ...realGoals];
        });
        setIsDemo(false);
      }
      setShowModal(false);
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to save goal.');
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteConfirm = async () => {
    if (!deleteTarget) return;
    if (isDemo) { setGoals(gs => gs.filter(g => g.goal_id !== deleteTarget.goal_id)); setDeleteTarget(null); return; }
    try {
      await deleteGoal(deleteTarget.goal_id);
      setGoals(gs => gs.filter(g => g.goal_id !== deleteTarget.goal_id));
    } catch {
      alert('Failed to delete goal.');
    }
    setDeleteTarget(null);
  };

  // Summary counts
  const onTrackCount  = goals.filter(g => g.status_label === 'On Track').length;
  const atRiskCount   = goals.filter(g => g.status_label === 'At Risk').length;
  const completedCount= goals.filter(g => g.status_label === 'Completed').length;

  const TABS = [
    { key: 'all',       label: 'All' },
    { key: 'active',    label: 'Active' },
    { key: 'completed', label: 'Completed' },
  ];

  return (
    <div style={{ minHeight: '100vh', background: C.bg, fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif' }}>
      <AppHeader profile={profile} onLogout={handleLogout} liveData={!isDemo} isDemo={isDemo} />

      <div style={{ maxWidth: 860, margin: '0 auto', padding: '40px 24px 64px' }}>

        {/* Back */}
        <button
          onClick={() => navigate('/dashboard')}
          style={{
            background: 'transparent', border: 'none', cursor: 'pointer',
            display: 'flex', alignItems: 'center', gap: 6,
            fontSize: 13, fontWeight: 600, color: C.muted, padding: 0, marginBottom: 28,
          }}
          onMouseEnter={e => { e.currentTarget.style.color = C.brand; }}
          onMouseLeave={e => { e.currentTarget.style.color = C.muted; }}
        >
          ← Back to Dashboard
        </button>

        {/* Page title + Add button */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 24 }}>
          <div>
            <h1 style={{ fontSize: 26, fontWeight: 800, color: C.ink, margin: '0 0 4px', letterSpacing: '-0.025em' }}>
              Goals
            </h1>
            <p style={{ margin: 0, fontSize: 13, color: C.muted }}>Track your financial targets and measure progress</p>
          </div>
          <button
            onClick={openCreate}
            style={{
              padding: '10px 20px', background: C.brand, color: '#fff',
              border: 'none', borderRadius: C.rs, fontSize: 13, fontWeight: 600,
              cursor: 'pointer', whiteSpace: 'nowrap',
            }}
            onMouseEnter={e => { e.currentTarget.style.background = C.brand2; }}
            onMouseLeave={e => { e.currentTarget.style.background = C.brand; }}
          >
            + Add New Goal
          </button>
        </div>

        {/* Summary bar */}
        <div style={{ display: 'flex', gap: 12, marginBottom: 24, flexWrap: 'wrap' }}>
          <SummaryBadge label="Total Goals"  value={goals.length}    />
          <SummaryBadge label="On Track"     value={onTrackCount}    color={C.success} />
          <SummaryBadge label="At Risk"      value={atRiskCount}     color={C.warning} />
          <SummaryBadge label="Completed"    value={completedCount}  color={C.muted}   />
        </div>

        {/* Filter tabs */}
        <div style={{ display: 'flex', gap: 4, marginBottom: 20 }}>
          {TABS.map(tab => (
            <button
              key={tab.key}
              onClick={() => handleFilterChange(tab.key)}
              style={{
                padding: '7px 16px',
                background: filter === tab.key ? C.brand : 'transparent',
                color: filter === tab.key ? '#fff' : C.muted,
                border: `1px solid ${filter === tab.key ? C.brand : C.border}`,
                borderRadius: 99, fontSize: 12, fontWeight: 600, cursor: 'pointer',
                transition: 'all 0.15s',
              }}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {error && (
          <div style={{
            padding: '12px 16px', borderRadius: C.rs, marginBottom: 20,
            background: 'rgba(220,38,38,0.07)', border: '1px solid rgba(220,38,38,0.2)',
            fontSize: 13, color: C.danger,
          }}>
            {error}
          </div>
        )}

        {/* Goals grid */}
        {loading ? (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(360px, 1fr))', gap: 16 }}>
            {[1, 2, 3].map(i => (
              <div key={i} style={{
                background: C.surface, borderRadius: C.r,
                border: `1px solid ${C.border}`, padding: '20px', height: 180,
                background: 'linear-gradient(90deg, #e8ede9 0%, #d4ddd8 50%, #e8ede9 100%)',
                backgroundSize: '400px 100%', animation: 'ff-shimmer 1.4s ease infinite',
              }} />
            ))}
          </div>
        ) : goals.length === 0 ? (
          <div style={{
            background: C.surface, borderRadius: C.r,
            border: `1px solid ${C.border}`, padding: '48px 24px',
            textAlign: 'center',
          }}>
            <div style={{ fontSize: 40 }}>🎯</div>
            <div style={{ fontSize: 16, fontWeight: 700, color: C.ink, marginTop: 12 }}>No goals yet</div>
            <div style={{ fontSize: 13, color: C.muted, marginTop: 6, marginBottom: 20 }}>
              Create your first financial goal to start tracking progress
            </div>
            <button
              onClick={openCreate}
              style={{
                padding: '10px 24px', background: C.brand, color: '#fff',
                border: 'none', borderRadius: C.rs, fontSize: 13, fontWeight: 600, cursor: 'pointer',
              }}
            >
              + Create First Goal
            </button>
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(360px, 1fr))', gap: 16 }}>
            {goals.map((g, i) => (
              <GoalCard
                key={g.goal_id || i}
                goal={g}
                onEdit={openEdit}
                onDelete={setDeleteTarget}
              />
            ))}
          </div>
        )}

        {/* Growth Insights */}
        {!loading && (
          <div style={{ marginTop: 32 }}>
            <GrowthInsightsPanel />
          </div>
        )}
      </div>

      {/* Add/Edit modal */}
      {showModal && (
        <GoalFormModal
          initial={editGoal}
          onSave={handleSave}
          onClose={() => setShowModal(false)}
          saving={saving}
        />
      )}

      {/* Delete confirm */}
      {deleteTarget && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 200,
          background: 'rgba(2,5,12,0.75)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16,
        }}>
          <div style={{
            background: C.surface, borderRadius: C.r,
            border: `1px solid ${C.border}`, boxShadow: C.shadow,
            padding: '28px 28px', maxWidth: 380, width: '100%',
          }}>
            <div style={{ fontSize: 16, fontWeight: 700, color: C.ink, marginBottom: 8 }}>Delete Goal?</div>
            <p style={{ margin: '0 0 20px', fontSize: 13, color: C.muted, lineHeight: 1.6 }}>
              Are you sure you want to delete <strong>{deleteTarget.name}</strong>? This action cannot be undone.
            </p>
            <div style={{ display: 'flex', gap: 10 }}>
              <button
                onClick={() => setDeleteTarget(null)}
                style={{
                  flex: 1, padding: '9px 0', background: 'transparent',
                  border: `1px solid ${C.border}`, borderRadius: C.rs,
                  fontSize: 13, fontWeight: 600, color: C.muted, cursor: 'pointer',
                }}
              >
                Cancel
              </button>
              <button
                onClick={handleDeleteConfirm}
                style={{
                  flex: 1, padding: '9px 0', background: C.danger, color: '#fff',
                  border: 'none', borderRadius: C.rs, fontSize: 13, fontWeight: 600, cursor: 'pointer',
                }}
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
