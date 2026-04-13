import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { getSnapshotsSummary } from '../api/simulations';
import { C } from '../theme/flowfundTheme';

const TYPE_LABEL = {
  compound_interest: 'Compound Interest',
  stock_market:      'Stock Market',
  debt_payoff:       'Debt Payoff',
  emergency_fund:    'Emergency Fund',
};
const TYPE_ICON = {
  compound_interest: '📈',
  stock_market:      '📊',
  debt_payoff:       '💳',
  emergency_fund:    '🛡️',
};

function outcomeValue(snap) {
  const s = snap.result_summary || {};
  if (snap.scenario_type === 'compound_interest') return s.final_value;
  if (snap.scenario_type === 'stock_market')      return s.base_value;
  if (snap.scenario_type === 'debt_payoff')       return s.months_to_payoff ? `${s.months_to_payoff} mo` : null;
  if (snap.scenario_type === 'emergency_fund')    return s.months_to_goal   ? `${s.months_to_goal} mo`   : null;
  return null;
}

function fmtOutcome(snap) {
  const v = outcomeValue(snap);
  if (v == null) return '—';
  if (typeof v === 'string') return v;
  return '$' + parseFloat(v).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
}

function SimRow({ snap }) {
  const icon  = TYPE_ICON[snap.scenario_type]  || '📐';
  const label = TYPE_LABEL[snap.scenario_type] || snap.scenario_type;
  return (
    <div style={{ padding: '9px 0', borderBottom: `1px solid ${C.border}`, display: 'flex', alignItems: 'center', gap: 10 }}>
      <span style={{ fontSize: 16, flexShrink: 0 }}>{icon}</span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 12, fontWeight: 600, color: C.ink, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {snap.name}
        </div>
        <div style={{ fontSize: 10, color: C.faint, marginTop: 1 }}>{label}</div>
      </div>
      <div style={{ fontSize: 12, fontWeight: 700, color: C.brand, flexShrink: 0, fontVariantNumeric: 'tabular-nums' }}>
        {fmtOutcome(snap)}
      </div>
    </div>
  );
}

export default function SimulationsWidget() {
  const navigate = useNavigate();
  const [data,    setData]    = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getSnapshotsSummary()
      .then(({ data: d }) => setData(d))
      .catch(() => setData(null))
      .finally(() => setLoading(false));
  }, []);

  const snaps   = data?.snapshots || [];
  const isEmpty = !loading && data !== null && snaps.length === 0;

  return (
    <div style={{
      background: C.surface, borderRadius: C.r,
      border: `1px solid ${C.border}`, boxShadow: C.shadowSm,
      overflow: 'hidden',
    }}>
      {/* Header */}
      <div style={{
        padding: '14px 18px', borderBottom: `1px solid ${C.border}`,
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
      }}>
        <div>
          <div style={{ fontSize: 13, fontWeight: 700, color: C.ink }}>Simulations</div>
          {data && (
            <div style={{ fontSize: 11, color: C.muted, marginTop: 1 }}>
              {data.total_count} saved scenario{data.total_count !== 1 ? 's' : ''}
            </div>
          )}
        </div>
        <button
          onClick={() => navigate('/simulations')}
          style={{ background: 'transparent', border: 'none', cursor: 'pointer', fontSize: 11, fontWeight: 600, color: C.brand, padding: 0 }}
        >
          View All →
        </button>
      </div>

      {/* Body */}
      <div style={{ padding: '0 18px' }}>
        {loading ? (
          [75, 60, 80].map((w, i) => (
            <div key={i} style={{ padding: '10px 0', borderBottom: `1px solid ${C.border}` }}>
              <div style={{
                height: 11, borderRadius: 6, width: `${w}%`, marginBottom: 5,
                background: 'linear-gradient(90deg, rgba(255,255,255,0.04) 0%, rgba(255,255,255,0.09) 50%, rgba(255,255,255,0.04) 100%)',
                backgroundSize: '400px 100%', animation: 'ff-shimmer 1.4s ease infinite',
              }} />
              <div style={{
                height: 9, borderRadius: 6, width: '45%',
                background: 'linear-gradient(90deg, rgba(255,255,255,0.04) 0%, rgba(255,255,255,0.09) 50%, rgba(255,255,255,0.04) 100%)',
                backgroundSize: '400px 100%', animation: 'ff-shimmer 1.4s ease infinite',
              }} />
            </div>
          ))
        ) : isEmpty ? (
          <div style={{ padding: '20px 0', textAlign: 'center' }}>
            <div style={{ fontSize: 28 }}>📐</div>
            <div style={{ fontSize: 12, fontWeight: 600, color: C.ink, marginTop: 6 }}>No simulations yet</div>
            <div style={{ fontSize: 11, color: C.muted, marginTop: 3 }}>Run your first scenario to see projections</div>
          </div>
        ) : data === null ? (
          <div style={{ padding: '16px 0', textAlign: 'center', fontSize: 12, color: C.muted }}>Unable to load simulations</div>
        ) : (
          snaps.map((s, i) => <SimRow key={s.sim_id || i} snap={s} />)
        )}
      </div>

      {/* Footer */}
      <div style={{ padding: '12px 18px' }}>
        <button
          onClick={() => navigate('/simulations')}
          style={{
            width: '100%', padding: '8px 0',
            background: C.brand, color: '#fff',
            border: 'none', borderRadius: C.rs,
            fontSize: 12, fontWeight: 600, cursor: 'pointer',
          }}
          onMouseEnter={e => { e.currentTarget.style.opacity = '0.88'; }}
          onMouseLeave={e => { e.currentTarget.style.opacity = '1'; }}
        >
          + Run New Simulation
        </button>
      </div>
    </div>
  );
}
