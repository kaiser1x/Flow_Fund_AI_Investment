import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { getProfile, logout as logoutApi } from '../api/auth';
import { getAlertPreferences, updateAlertPreferences, getAnomalyEvents } from '../api/alerts';
import AppHeader from '../components/AppHeader';
import { C } from '../theme/flowfundTheme';

function ToggleRow({ label, description, checked, onChange, disabled }) {
  return (
    <div style={{
      display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '16px',
      padding: '16px 0', borderBottom: `1px solid ${C.border}`,
    }}>
      <div>
        <div style={{ fontSize: '14px', fontWeight: 600, color: C.ink }}>{label}</div>
        <div style={{ fontSize: '12px', color: C.muted, marginTop: '4px', lineHeight: 1.5 }}>{description}</div>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        style={{
          flexShrink: 0, width: 48, height: 26, borderRadius: 99, border: 'none', cursor: disabled ? 'not-allowed' : 'pointer',
          background: checked ? C.brand : '#d4ddd8', position: 'relative', transition: 'background 0.15s',
        }}
      >
        <span style={{
          position: 'absolute', top: 3, left: checked ? 25 : 3,
          width: 20, height: 20, borderRadius: '50%', background: '#fff',
          boxShadow: '0 1px 3px rgba(0,0,0,0.15)', transition: 'left 0.15s',
        }} />
      </button>
    </div>
  );
}

export default function AlertSettingsPage() {
  const navigate = useNavigate();
  const [profile, setProfile] = useState(null);
  const [prefs, setPrefs] = useState(null);
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [savedMsg, setSavedMsg] = useState('');

  useEffect(() => {
    Promise.all([
      getProfile().then((r) => setProfile(r.data)).catch(() => {}),
      getAlertPreferences().then((r) => setPrefs(r.data)).catch(() => setError('Could not load preferences')),
      getAnomalyEvents(25).then((r) => setEvents(r.data.events || [])).catch(() => {}),
    ]).finally(() => setLoading(false));
  }, []);

  const update = (patch) => {
    setPrefs((p) => ({ ...p, ...patch }));
    setSavedMsg('');
    setError('');
  };

  const save = async () => {
    if (!prefs) return;
    setSaving(true);
    setError('');
    setSavedMsg('');
    try {
      const { data } = await updateAlertPreferences(prefs);
      setPrefs(data);
      setSavedMsg('Saved.');
    } catch (e) {
      setError(e.response?.data?.error || 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  const handleLogout = async () => {
    try { await logoutApi(); } catch (_) {}
    localStorage.removeItem('token');
    navigate('/login');
  };

  return (
    <div style={{ minHeight: '100vh', background: C.bg, fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif' }}>
      <AppHeader profile={profile} onLogout={handleLogout} liveData={true} isDemo={false} />

      <div style={{ maxWidth: '720px', margin: '0 auto', padding: '32px 24px 64px' }}>
        <button
          type="button"
          onClick={() => navigate('/profile')}
          style={{
            background: 'transparent', border: 'none', cursor: 'pointer', fontSize: '13px', fontWeight: 600,
            color: C.muted, padding: 0, marginBottom: '24px',
          }}
        >
          ← Back to Profile
        </button>

        <h1 style={{ fontSize: '26px', fontWeight: 800, color: C.ink, margin: '0 0 8px' }}>Alerts & monitoring</h1>
        <p style={{ fontSize: '13px', color: C.muted, margin: '0 0 28px', lineHeight: 1.6 }}>
          Turn notification types on or off. FlowFund uses <strong>threshold rules</strong> on your synced data (not a black-box AI model) to flag unusual amounts, spending trends, cash buffer, readiness score changes, and goal milestones.
        </p>

        {loading ? (
          <div style={{ color: C.muted, fontSize: '14px' }}>Loading…</div>
        ) : prefs ? (
          <>
            {error && (
              <div style={{ padding: '12px 14px', borderRadius: C.rs, background: 'rgba(220,38,38,0.08)', color: C.danger, fontSize: '13px', marginBottom: '16px' }}>
                {error}
              </div>
            )}
            {savedMsg && (
              <div style={{ padding: '12px 14px', borderRadius: C.rs, background: 'rgba(22,163,74,0.08)', color: C.success, fontSize: '13px', marginBottom: '16px' }}>
                {savedMsg}
              </div>
            )}

            <div style={{ background: C.surface, borderRadius: C.r, border: `1px solid ${C.border}`, boxShadow: C.shadowSm, padding: '8px 22px 22px', marginBottom: '24px' }}>
              <ToggleRow
                label="Unusual expense amounts"
                description="Notify when a new expense is much larger than your 90-day average in that category (or overall). Default: at least 2× the average."
                checked={prefs.anomaly_amount_enabled}
                onChange={(v) => update({ anomaly_amount_enabled: v })}
                disabled={saving}
              />
              <div style={{ padding: '8px 0 16px', borderBottom: `1px solid ${C.border}` }}>
                <label style={{ fontSize: '11px', fontWeight: 700, color: C.faint, textTransform: 'uppercase' }}>Size multiplier vs average</label>
                <input
                  type="number"
                  step="0.1"
                  min="1.1"
                  max="10"
                  value={prefs.anomaly_amount_multiplier}
                  onChange={(e) => update({ anomaly_amount_multiplier: parseFloat(e.target.value) || 2 })}
                  disabled={saving || !prefs.anomaly_amount_enabled}
                  style={{ marginTop: 6, width: 120, padding: '8px 10px', borderRadius: C.rs, border: `1px solid ${C.border}` }}
                />
                <span style={{ fontSize: '12px', color: C.muted, marginLeft: 10 }}>e.g. 2 = 200% of typical (2×)</span>
              </div>

              <ToggleRow
                label="Category spending spike"
                description="When your top category is 20%+ higher than the prior 30 days (and prior spend was at least $50)."
                checked={prefs.spending_spike_enabled}
                onChange={(v) => update({ spending_spike_enabled: v })}
                disabled={saving}
              />
              <ToggleRow
                label="Weekly expense highlight"
                description="Your largest purchase in the last 7 days (minimum $25), at most once per week."
                checked={prefs.weekly_expense_highlight_enabled}
                onChange={(v) => update({ weekly_expense_highlight_enabled: v })}
                disabled={saving}
              />
              <ToggleRow
                label="Low cash buffer"
                description="Warn when estimated months of expenses covered by balances falls below your threshold."
                checked={prefs.low_cash_buffer_enabled}
                onChange={(v) => update({ low_cash_buffer_enabled: v })}
                disabled={saving}
              />
              <div style={{ padding: '8px 0 16px', borderBottom: `1px solid ${C.border}` }}>
                <label style={{ fontSize: '11px', fontWeight: 700, color: C.faint, textTransform: 'uppercase' }}>Alert if buffer below (months)</label>
                <input
                  type="number"
                  step="0.1"
                  min="0.1"
                  max="12"
                  value={prefs.low_cash_buffer_threshold_months}
                  onChange={(e) => update({ low_cash_buffer_threshold_months: parseFloat(e.target.value) || 1 })}
                  disabled={saving || !prefs.low_cash_buffer_enabled}
                  style={{ marginTop: 6, width: 120, padding: '8px 10px', borderRadius: C.rs, border: `1px solid ${C.border}` }}
                />
              </div>

              <ToggleRow
                label="Investment readiness score changes"
                description="When your score moves by at least the number of points below compared with the last stored score (after sync, manual demo edits, etc.). Use 1 to be notified on any change."
                checked={prefs.readiness_change_enabled}
                onChange={(v) => update({ readiness_change_enabled: v })}
                disabled={saving}
              />
              <div style={{ padding: '8px 0 16px', borderBottom: `1px solid ${C.border}` }}>
                <label style={{ fontSize: '11px', fontWeight: 700, color: C.faint, textTransform: 'uppercase' }}>Minimum point change</label>
                <input
                  type="number"
                  min="1"
                  max="50"
                  value={prefs.readiness_change_min_points}
                  onChange={(e) => update({ readiness_change_min_points: parseInt(e.target.value, 10) || 1 })}
                  disabled={saving || !prefs.readiness_change_enabled}
                  style={{ marginTop: 6, width: 120, padding: '8px 10px', borderRadius: C.rs, border: `1px solid ${C.border}` }}
                />
              </div>

              <ToggleRow
                label="Goal milestones (50%, 75%, 100%)"
                description="One-time heads-up per milestone per goal."
                checked={prefs.goal_milestone_enabled}
                onChange={(v) => update({ goal_milestone_enabled: v })}
                disabled={saving}
              />
            </div>

            <button
              type="button"
              onClick={save}
              disabled={saving}
              style={{
                padding: '12px 24px', background: C.brand, color: '#fff', border: 'none', borderRadius: C.rs,
                fontSize: '14px', fontWeight: 600, cursor: saving ? 'wait' : 'pointer', opacity: saving ? 0.85 : 1,
              }}
            >
              {saving ? 'Saving…' : 'Save preferences'}
            </button>

            <h2 style={{ fontSize: '18px', fontWeight: 700, color: C.ink, margin: '40px 0 12px' }}>Recent flagged events</h2>
            <p style={{ fontSize: '12px', color: C.muted, margin: '0 0 16px' }}>
              Logged when rules fire (whether or not an in-app notification was delivered). Failed deliveries are retried only on the next action; failures are stored server-side.
            </p>
            <div style={{ background: C.surface, borderRadius: C.r, border: `1px solid ${C.border}`, overflow: 'hidden' }}>
              {events.length === 0 ? (
                <div style={{ padding: '28px', textAlign: 'center', color: C.faint, fontSize: '13px' }}>No events yet. Sync your bank to populate data.</div>
              ) : (
                events.map((ev) => (
                  <div key={ev.anomaly_id} style={{ padding: '14px 18px', borderBottom: `1px solid ${C.border}`, fontSize: '13px' }}>
                    <div style={{ fontWeight: 600, color: C.ink }}>{ev.anomaly_type.replace(/_/g, ' ')}</div>
                    <div style={{ color: C.muted, marginTop: 4, fontSize: '11px' }}>
                      {new Date(ev.created_at).toLocaleString()} · {ev.severity}
                      {ev.notification_sent ? ' · notified' : ' · log only'}
                    </div>
                  </div>
                ))
              )}
            </div>
          </>
        ) : null}
      </div>
    </div>
  );
}
