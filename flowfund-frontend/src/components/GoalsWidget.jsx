import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { getGoalsSummary } from '../api/goals';
import { C } from '../theme/flowfundTheme';

const STATUS_COLOR = { green: '#34d399', yellow: '#fbbf24', red: '#f87171' };
const TYPE_ICON    = { savings: '🏦', debt_payoff: '💳', spending_limit: '📊', investment_target: '📈' };

function ProgressBar({ pct, color }) {
  return (
    <div style={{
      height: 6, borderRadius: 99,
      background: 'rgba(255,255,255,0.08)',
      overflow: 'hidden', marginTop: 4,
    }}>
      <div style={{
        height: '100%',
        width: `${Math.min(100, pct)}%`,
        background: color,
        borderRadius: 99,
        transition: 'width 0.4s ease',
      }} />
    </div>
  );
}

function GoalRow({ goal }) {
  const color = STATUS_COLOR[goal.status_color] || C.muted;
  const icon  = TYPE_ICON[goal.type] || '🎯';
  const fmt   = n => '$' + parseFloat(n).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 });

  return (
    <div style={{ padding: '10px 0', borderBottom: `1px solid ${C.border}` }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 3 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ fontSize: 13 }}>{icon}</span>
          <span style={{ fontSize: 13, fontWeight: 600, color: C.ink }}>{goal.name}</span>
        </div>
        <span style={{
          fontSize: 10, fontWeight: 700, color,
          background: color + '18', border: `1px solid ${color}33`,
          borderRadius: 20, padding: '1px 7px',
        }}>
          {goal.status_label}
        </span>
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: C.muted, marginBottom: 2 }}>
        <span>{fmt(goal.current_amount)} of {fmt(goal.target_amount)}</span>
        <span>{goal.progress_pct}%</span>
      </div>
      <ProgressBar pct={goal.progress_pct} color={color} />
    </div>
  );
}

export default function GoalsWidget() {
  const navigate = useNavigate();
  const [data,    setData]    = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getGoalsSummary()
      .then(({ data: d }) => setData(d))
      .catch(() => setData(null))
      .finally(() => setLoading(false));
  }, []);

  const goals   = data?.goals || [];
  const isEmpty = !loading && data !== null && goals.length === 0;

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
          <div style={{ fontSize: 13, fontWeight: 700, color: C.ink }}>Goals</div>
          {data && (
            <div style={{ fontSize: 11, color: C.muted, marginTop: 1 }}>
              {data.on_track} on track · {data.at_risk} at risk
            </div>
          )}
        </div>
        <button
          onClick={() => navigate('/goals')}
          style={{
            background: 'transparent', border: 'none', cursor: 'pointer',
            fontSize: 11, fontWeight: 600, color: C.brand, padding: 0,
          }}
        >
          View All →
        </button>
      </div>

      {/* Body */}
      <div style={{ padding: '0 18px' }}>
        {loading ? (
          [80, 65, 72].map((w, i) => (
            <div key={i} style={{ padding: '12px 0', borderBottom: `1px solid ${C.border}` }}>
              <div style={{
                height: 12, borderRadius: 6, width: `${w}%`, marginBottom: 6,
                background: 'linear-gradient(90deg, rgba(255,255,255,0.04) 0%, rgba(255,255,255,0.09) 50%, rgba(255,255,255,0.04) 100%)',
                backgroundSize: '400px 100%', animation: 'ff-shimmer 1.4s ease infinite',
              }} />
              <div style={{
                height: 6, borderRadius: 99, width: '100%',
                background: 'linear-gradient(90deg, rgba(255,255,255,0.04) 0%, rgba(255,255,255,0.09) 50%, rgba(255,255,255,0.04) 100%)',
                backgroundSize: '400px 100%', animation: 'ff-shimmer 1.4s ease infinite',
              }} />
            </div>
          ))
        ) : isEmpty ? (
          <div style={{ padding: '20px 0', textAlign: 'center' }}>
            <div style={{ fontSize: 28 }}>🎯</div>
            <div style={{ fontSize: 12, fontWeight: 600, color: C.ink, marginTop: 6 }}>No goals yet</div>
            <div style={{ fontSize: 11, color: C.muted, marginTop: 3 }}>Set a financial goal to start tracking progress</div>
          </div>
        ) : data === null ? (
          <div style={{ padding: '16px 0', textAlign: 'center', fontSize: 12, color: C.muted }}>
            Unable to load goals
          </div>
        ) : (
          goals.map((g, i) => <GoalRow key={g.goal_id || i} goal={g} />)
        )}
      </div>

      {/* Footer */}
      <div style={{ padding: '12px 18px', display: 'flex', justifyContent: 'center' }}>
        <button
          onClick={() => navigate('/goals')}
          style={{
            width: '100%', padding: '8px 0',
            background: C.brand, color: '#fff',
            border: 'none', borderRadius: C.rs,
            fontSize: 12, fontWeight: 600, cursor: 'pointer',
          }}
          onMouseEnter={e => { e.currentTarget.style.opacity = '0.88'; }}
          onMouseLeave={e => { e.currentTarget.style.opacity = '1'; }}
        >
          + Add Goal
        </button>
      </div>
    </div>
  );
}
