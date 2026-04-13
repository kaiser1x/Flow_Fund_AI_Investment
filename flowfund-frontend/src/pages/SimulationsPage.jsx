import { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ResponsiveContainer, LineChart, Line,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend,
} from 'recharts';
import {
  runSimulation, getPreFill, getSnapshots,
  saveSnapshot, deleteSnapshot,
} from '../api/simulations';
import { getProfile, logout as logoutApi } from '../api/auth';
import AppHeader from '../components/AppHeader';
import { C } from '../theme/flowfundTheme';

// ── Constants ─────────────────────────────────────────────────────────────────
const SCENARIO_TYPES = [
  {
    key: 'compound_interest',
    label: 'Compound Interest',
    icon: '📈',
    desc: 'Project savings growth with regular contributions and a fixed interest rate.',
  },
  {
    key: 'stock_market',
    label: 'Stock Market',
    icon: '📊',
    desc: 'Model investment growth with optimistic and pessimistic projections based on volatility.',
  },
  {
    key: 'debt_payoff',
    label: 'Debt Payoff',
    icon: '💳',
    desc: 'Calculate how long it will take to pay off a debt and total interest paid.',
  },
  {
    key: 'emergency_fund',
    label: 'Emergency Fund',
    icon: '🛡️',
    desc: 'Find out when you will reach your emergency fund target at your current contribution rate.',
  },
];

const TYPE_LABEL = {
  compound_interest: 'Compound Interest',
  stock_market:      'Stock Market',
  debt_payoff:       'Debt Payoff',
  emergency_fund:    'Emergency Fund',
};

const DISCLAIMER = 'These projections are estimates only based on the inputs provided. They do not constitute financial advice. Actual results will vary based on market conditions, taxes, fees, and other factors.';

// ── Helpers ───────────────────────────────────────────────────────────────────
const fmt  = n => '$' + parseFloat(n || 0).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
const fmtD = n => '$' + parseFloat(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

function outcomeLabel(snap) {
  const s = snap.result_summary || {};
  if (snap.scenario_type === 'compound_interest') return `${fmt(s.final_value)} projected`;
  if (snap.scenario_type === 'stock_market')      return `${fmt(s.base_value)} base projection`;
  if (snap.scenario_type === 'debt_payoff')       return `${s.months_to_payoff} months to payoff`;
  if (snap.scenario_type === 'emergency_fund')    return `${s.months_to_goal} months to goal`;
  return '—';
}

// ── Chart tooltip ─────────────────────────────────────────────────────────────
function SimTooltip({ active, payload, label, scenarioType }) {
  if (!active || !payload?.length) return null;
  const xLabel = scenarioType === 'debt_payoff' || scenarioType === 'emergency_fund'
    ? `Month ${label}` : `Year ${label}`;
  return (
    <div style={{
      background: C.surface, border: `1px solid ${C.border}`,
      borderRadius: 8, padding: '10px 14px', fontSize: 12, boxShadow: C.shadowSm,
    }}>
      <div style={{ fontWeight: 700, color: C.ink, marginBottom: 6 }}>{xLabel}</div>
      {payload.map((p, i) => (
        <div key={i} style={{ color: p.color, marginBottom: 2 }}>
          {p.name}: {typeof p.value === 'number' ? fmtD(p.value) : p.value}
        </div>
      ))}
    </div>
  );
}

// ── Chart ─────────────────────────────────────────────────────────────────────
function SimChart({ scenarioType, projectionData }) {
  if (!projectionData || projectionData.length === 0) return null;

  const xKey = scenarioType === 'debt_payoff' || scenarioType === 'emergency_fund' ? 'month' : 'year';

  const lines = {
    compound_interest: [
      { key: 'projected_value',   color: C.brand,   name: 'Projected Value' },
      { key: 'total_contributed', color: C.accent,  name: 'Total Contributed' },
    ],
    stock_market: [
      { key: 'base',        color: C.brand,   name: 'Base' },
      { key: 'optimistic',  color: C.success, name: 'Optimistic' },
      { key: 'pessimistic', color: C.danger,  name: 'Pessimistic' },
    ],
    debt_payoff: [
      { key: 'remaining_balance', color: C.danger,  name: 'Remaining Balance' },
      { key: 'interest_paid',     color: C.warning, name: 'Interest Paid' },
    ],
    emergency_fund: [
      { key: 'balance', color: C.brand,   name: 'Balance' },
      { key: 'target',  color: C.success, name: 'Target', strokeDasharray: '5 5' },
    ],
  }[scenarioType] || [];

  return (
    <ResponsiveContainer width="100%" height={260}>
      <LineChart data={projectionData} margin={{ top: 10, right: 20, left: 10, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke={C.chartGrid} />
        <XAxis
          dataKey={xKey}
          tick={{ fontSize: 11, fill: C.faint }}
          label={{ value: xKey === 'year' ? 'Year' : 'Month', position: 'insideBottomRight', offset: -5, fontSize: 11, fill: C.faint }}
        />
        <YAxis
          tick={{ fontSize: 10, fill: C.faint }}
          tickFormatter={v => v >= 1000 ? `$${(v / 1000).toFixed(0)}k` : `$${v}`}
          width={54}
        />
        <Tooltip content={<SimTooltip scenarioType={scenarioType} />} />
        <Legend wrapperStyle={{ fontSize: 11 }} />
        {lines.map(l => (
          <Line
            key={l.key}
            type="monotone"
            dataKey={l.key}
            stroke={l.color}
            name={l.name}
            dot={false}
            strokeWidth={2}
            strokeDasharray={l.strokeDasharray}
          />
        ))}
      </LineChart>
    </ResponsiveContainer>
  );
}

// ── Input fields per scenario ─────────────────────────────────────────────────
function ScenarioInputs({ scenarioType, values, onChange, prefill }) {
  const field = (key, label, opts = {}) => (
    <div key={key}>
      <label style={{ fontSize: 12, fontWeight: 600, color: C.muted, display: 'block', marginBottom: 4 }}>
        {label}{opts.required && <span style={{ color: C.danger }}> *</span>}
        {opts.hint && <span style={{ fontWeight: 400, color: C.faint }}> ({opts.hint})</span>}
      </label>
      {opts.select ? (
        <select
          value={values[key] || ''}
          onChange={e => onChange(key, e.target.value)}
          style={inputStyle()}
        >
          {opts.options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      ) : (
        <input
          type={opts.type || 'number'}
          min={opts.min ?? 0}
          step={opts.step || 'any'}
          value={values[key] ?? ''}
          onChange={e => onChange(key, e.target.value)}
          placeholder={opts.placeholder || ''}
          style={inputStyle()}
        />
      )}
    </div>
  );

  if (scenarioType === 'compound_interest') return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
      {field('initial_amount',      'Initial Amount ($)',        { required: true, placeholder: prefill?.current_balance?.toFixed(0) || '1000' })}
      {field('monthly_contribution','Monthly Contribution ($)',  { required: true, placeholder: prefill?.avg_monthly_savings?.toFixed(0) || '200' })}
      {field('annual_rate',         'Annual Rate (%)',           { required: true, placeholder: '5', hint: '0–100' })}
      {field('years',               'Time Period (years)',       { required: true, placeholder: '10', min: 1, step: 1 })}
    </div>
  );

  if (scenarioType === 'stock_market') return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
      {field('initial_amount',      'Initial Amount ($)',        { required: true, placeholder: prefill?.current_balance?.toFixed(0) || '5000' })}
      {field('monthly_contribution','Monthly Contribution ($)',  { required: true, placeholder: prefill?.avg_monthly_savings?.toFixed(0) || '300' })}
      {field('annual_rate',         'Expected Return Rate (%)', { required: true, placeholder: '8', hint: '0–100' })}
      {field('years',               'Time Period (years)',       { required: true, placeholder: '10', min: 1, step: 1 })}
      {field('volatility', 'Volatility', {
        select: true,
        options: [
          { value: 'low',    label: 'Low'    },
          { value: 'medium', label: 'Medium' },
          { value: 'high',   label: 'High'   },
        ],
      })}
    </div>
  );

  if (scenarioType === 'debt_payoff') return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
      {field('principal',       'Debt Amount ($)',       { required: true, placeholder: '10000' })}
      {field('annual_rate',     'Annual Interest Rate (%)', { required: true, placeholder: '18', hint: '0–100' })}
      {field('monthly_payment', 'Monthly Payment ($)',   { required: true, placeholder: '300' })}
    </div>
  );

  if (scenarioType === 'emergency_fund') return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
      {field('monthly_expenses',    'Monthly Expenses ($)',          { required: true, placeholder: prefill?.avg_monthly_spending?.toFixed(0) || '500' })}
      {field('target_months',       'Target Months of Coverage',    { required: true, placeholder: '6', min: 1, step: 1 })}
      {field('current_savings',     'Current Savings ($)',          { required: true, placeholder: prefill?.current_balance?.toFixed(0) || '0' })}
      {field('monthly_contribution','Monthly Contribution ($)',      { required: true, placeholder: '200' })}
    </div>
  );

  return null;
}

function inputStyle() {
  return {
    width: '100%', padding: '9px 12px',
    border: `1px solid ${C.border}`, borderRadius: C.rs,
    fontSize: 13, color: C.ink, background: 'rgba(255,255,255,0.05)',
    outline: 'none', boxSizing: 'border-box',
  };
}

// ── Default inputs per type ───────────────────────────────────────────────────
function defaultInputs(type, prefill) {
  const bal  = prefill?.current_balance  || 0;
  const sav  = prefill?.avg_monthly_savings  || 0;
  const exp  = prefill?.avg_monthly_spending || 0;
  switch (type) {
    case 'compound_interest': return { initial_amount: bal || '', monthly_contribution: sav || '', annual_rate: 5, years: 10 };
    case 'stock_market':      return { initial_amount: bal || '', monthly_contribution: sav || '', annual_rate: 8, years: 10, volatility: 'medium' };
    case 'debt_payoff':       return { principal: '', annual_rate: 18, monthly_payment: '' };
    case 'emergency_fund':    return { monthly_expenses: exp || '', target_months: 6, current_savings: bal || '', monthly_contribution: sav || '' };
    default: return {};
  }
}

// ── Result summary display ────────────────────────────────────────────────────
function ResultSummary({ result, scenarioType }) {
  if (!result) return null;
  const s = result.result_summary;

  const items = [];
  if (scenarioType === 'compound_interest') {
    items.push({ label: 'Projected Value',    value: fmtD(s.final_value),        color: C.brand });
    items.push({ label: 'Total Contributed',  value: fmtD(s.total_contributed),  color: C.ink });
    items.push({ label: 'Total Interest',     value: fmtD(s.total_interest),     color: C.success });
    items.push({ label: 'Time Period',        value: `${s.years} years`,          color: C.ink });
  } else if (scenarioType === 'stock_market') {
    items.push({ label: 'Base Projection',        value: fmtD(s.base_value),        color: C.brand });
    items.push({ label: 'Optimistic Projection',  value: fmtD(s.optimistic_value),  color: C.success });
    items.push({ label: 'Pessimistic Projection', value: fmtD(s.pessimistic_value), color: C.danger });
    items.push({ label: 'Volatility',             value: s.volatility,               color: C.ink });
  } else if (scenarioType === 'debt_payoff') {
    items.push({ label: 'Months to Payoff', value: `${s.months_to_payoff} months`, color: C.brand });
    items.push({ label: 'Total Interest',   value: fmtD(s.total_interest),          color: C.danger });
    items.push({ label: 'Total Paid',       value: fmtD(s.total_paid),              color: C.ink });
    items.push({ label: 'Original Debt',    value: fmtD(s.principal),               color: C.ink });
  } else if (scenarioType === 'emergency_fund') {
    items.push({ label: 'Target Amount',   value: fmtD(s.target_amount),        color: C.brand });
    items.push({ label: 'Months to Goal',  value: `${s.months_to_goal} months`, color: C.brand });
    items.push({ label: 'Completion Date', value: s.completion_date,             color: C.ink });
    items.push({ label: 'Current Savings', value: fmtD(s.current_savings),       color: C.ink });
  }

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: 10, marginBottom: 16 }}>
      {items.map((item, i) => (
        <div key={i} style={{
          background: 'rgba(255,255,255,0.04)', borderRadius: C.rs,
          border: `1px solid ${C.border}`, padding: '10px 14px',
        }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: C.faint, textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 3 }}>
            {item.label}
          </div>
          <div style={{ fontSize: 15, fontWeight: 800, color: item.color, fontVariantNumeric: 'tabular-nums' }}>
            {item.value}
          </div>
        </div>
      ))}
    </div>
  );
}

// ── Data table ────────────────────────────────────────────────────────────────
function ProjectionTable({ scenarioType, projectionData }) {
  const [expanded, setExpanded] = useState(false);
  if (!projectionData || projectionData.length === 0) return null;

  const display = expanded ? projectionData : projectionData.slice(0, 5);
  const xKey    = scenarioType === 'debt_payoff' || scenarioType === 'emergency_fund' ? 'month' : 'year';
  const xLabel  = xKey === 'year' ? 'Year' : 'Month';

  const colKeys = Object.keys(projectionData[0]).filter(k => k !== xKey);

  return (
    <div style={{ marginTop: 12 }}>
      <div style={{ fontSize: 12, fontWeight: 700, color: C.ink, marginBottom: 6 }}>Year-by-Year Breakdown</div>
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
          <thead>
            <tr style={{ background: 'rgba(255,255,255,0.04)' }}>
              <th style={thStyle}>{xLabel}</th>
              {colKeys.map(k => <th key={k} style={thStyle}>{k.replace(/_/g, ' ')}</th>)}
            </tr>
          </thead>
          <tbody>
            {display.map((row, i) => (
              <tr key={i} style={{ borderBottom: `1px solid ${C.border}` }}>
                <td style={tdStyle}>{row[xKey]}</td>
                {colKeys.map(k => (
                  <td key={k} style={{ ...tdStyle, fontVariantNumeric: 'tabular-nums' }}>
                    {typeof row[k] === 'number' ? fmtD(row[k]) : row[k]}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {projectionData.length > 5 && (
        <button
          onClick={() => setExpanded(e => !e)}
          style={{ marginTop: 6, background: 'transparent', border: 'none', fontSize: 11, color: C.brand, cursor: 'pointer', fontWeight: 600 }}
        >
          {expanded ? 'Show less ▲' : `Show all ${projectionData.length} rows ▼`}
        </button>
      )}
    </div>
  );
}
const thStyle = { padding: '8px 10px', textAlign: 'left', fontWeight: 700, color: C.muted, borderBottom: `1px solid ${C.border}`, whiteSpace: 'nowrap' };
const tdStyle = { padding: '7px 10px', color: C.ink, whiteSpace: 'nowrap' };

// ── Simulation Builder Modal ──────────────────────────────────────────────────
function SimulationBuilder({ prefill, initialSnap, onSaved, onClose }) {
  const [scenarioType, setScenarioType] = useState(initialSnap?.scenario_type || 'compound_interest');
  const [inputs,  setInputs]  = useState(initialSnap?.inputs || defaultInputs('compound_interest', prefill));
  const [result,  setResult]  = useState(initialSnap ? { result_summary: initialSnap.result_summary, projection_data: [] } : null);
  const [running, setRunning] = useState(false);
  const [runErr,  setRunErr]  = useState('');
  const [simName, setSimName] = useState(initialSnap?.name || '');
  const [saving,  setSaving]  = useState(false);
  const [saveErr, setSaveErr] = useState('');
  const debounceRef = useRef(null);

  // When scenario changes, reset inputs to defaults for that type
  function switchType(type) {
    setScenarioType(type);
    setInputs(defaultInputs(type, prefill));
    setResult(null);
    setRunErr('');
  }

  function handleInput(key, val) {
    setInputs(prev => ({ ...prev, [key]: val }));
  }

  // Debounced auto-run on input change
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      handleRun();
    }, 700);
    return () => clearTimeout(debounceRef.current);
  }, [inputs, scenarioType]);

  async function handleRun() {
    setRunning(true);
    setRunErr('');
    try {
      const { data } = await runSimulation({ scenario_type: scenarioType, inputs });
      setResult(data);
    } catch (err) {
      setRunErr(err.response?.data?.error || 'Calculation error — check your inputs.');
      setResult(null);
    } finally {
      setRunning(false);
    }
  }

  async function handleSave() {
    if (!simName.trim()) { setSaveErr('Please enter a name for this simulation.'); return; }
    if (!result)         { setSaveErr('Run a simulation first.'); return; }
    setSaving(true);
    setSaveErr('');
    try {
      const { data } = await saveSnapshot({
        name: simName.trim(),
        scenario_type: scenarioType,
        inputs,
        result_summary:  result.result_summary,
        projection_data: result.projection_data || [],
      });
      onSaved(data.snapshot);
    } catch (err) {
      setSaveErr(err.response?.data?.error || 'Failed to save.');
    } finally {
      setSaving(false);
    }
  }

  const irScore = prefill?.investment_readiness_score;

  return (
    <div
      style={{ position: 'fixed', inset: 0, zIndex: 200, background: 'rgba(2,5,12,0.75)', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '24px 16px', overflowY: 'auto' }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div style={{ background: C.surface, borderRadius: C.r, border: `1px solid ${C.border}`, boxShadow: C.shadow, width: '100%', maxWidth: 720, marginBottom: 24 }}>

        {/* Header */}
        <div style={{ padding: '20px 24px', borderBottom: `1px solid ${C.border}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ fontSize: 18, fontWeight: 800, color: C.ink }}>Simulation Builder</div>
          <button onClick={onClose} style={{ background: 'transparent', border: 'none', fontSize: 20, color: C.muted, cursor: 'pointer', lineHeight: 1 }}>✕</button>
        </div>

        <div style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 20 }}>

          {/* IR score context */}
          {irScore !== null && irScore !== undefined && (
            <div style={{ padding: '10px 14px', borderRadius: C.rs, background: 'rgba(26,77,62,0.06)', border: `1px solid rgba(26,77,62,0.15)`, fontSize: 12, color: C.ink }}>
              <strong>Your Investment Readiness Score: {irScore}/100</strong>
              {irScore >= 80 && ' — Strong position. A higher return rate assumption may be appropriate.'}
              {irScore >= 50 && irScore < 80 && ' — Moderate readiness. Consider a conservative return rate.'}
              {irScore < 50 && ' — Build your financial base before committing to high-risk investments.'}
            </div>
          )}

          {/* Scenario selector */}
          <div>
            <div style={{ fontSize: 12, fontWeight: 700, color: C.muted, marginBottom: 8 }}>Scenario Type</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 8 }}>
              {SCENARIO_TYPES.map(s => (
                <button
                  key={s.key}
                  onClick={() => switchType(s.key)}
                  style={{
                    padding: '10px 12px', textAlign: 'left',
                    background: scenarioType === s.key ? C.brand : '#f8faf9',
                    color: scenarioType === s.key ? '#fff' : C.ink,
                    border: `1px solid ${scenarioType === s.key ? C.brand : C.border}`,
                    borderRadius: C.rs, cursor: 'pointer',
                  }}
                >
                  <div style={{ fontSize: 14 }}>{s.icon} <span style={{ fontWeight: 700, fontSize: 12 }}>{s.label}</span></div>
                  <div style={{ fontSize: 10, marginTop: 3, opacity: 0.75 }}>{s.desc}</div>
                </button>
              ))}
            </div>
          </div>

          {/* Inputs */}
          <div>
            <div style={{ fontSize: 12, fontWeight: 700, color: C.muted, marginBottom: 8 }}>Inputs</div>
            <ScenarioInputs scenarioType={scenarioType} values={inputs} onChange={handleInput} prefill={prefill} />
          </div>

          {/* Results */}
          {(running || result || runErr) && (
            <div>
              <div style={{ fontSize: 12, fontWeight: 700, color: C.muted, marginBottom: 8 }}>
                Results {running && <span style={{ color: C.faint, fontWeight: 400 }}>— calculating…</span>}
              </div>
              {runErr && (
                <div style={{ padding: '10px 14px', borderRadius: C.rs, background: 'rgba(220,38,38,0.07)', border: '1px solid rgba(220,38,38,0.2)', fontSize: 12, color: C.danger }}>
                  {runErr}
                </div>
              )}
              {result && !running && (
                <>
                  <ResultSummary result={result} scenarioType={scenarioType} />
                  <SimChart scenarioType={scenarioType} projectionData={result.projection_data} />
                  <ProjectionTable scenarioType={scenarioType} projectionData={result.projection_data} />
                </>
              )}
            </div>
          )}

          {/* Disclaimer */}
          <div style={{ fontSize: 11, color: C.faint, lineHeight: 1.6, borderTop: `1px solid ${C.border}`, paddingTop: 12 }}>
            ⚠ {DISCLAIMER}
          </div>

          {/* Save */}
          <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
            <div style={{ flex: 1 }}>
              <input
                value={simName}
                onChange={e => { setSimName(e.target.value); setSaveErr(''); }}
                placeholder="Name this simulation…"
                maxLength={100}
                style={{ ...inputStyle(), marginBottom: saveErr ? 4 : 0 }}
              />
              {saveErr && <div style={{ fontSize: 11, color: C.danger }}>{saveErr}</div>}
            </div>
            <button
              onClick={handleSave}
              disabled={saving || !result}
              style={{
                padding: '9px 20px', flexShrink: 0,
                background: (saving || !result) ? '#dde4e1' : C.brand,
                color: (saving || !result) ? C.faint : '#fff',
                border: 'none', borderRadius: C.rs,
                fontSize: 13, fontWeight: 600, cursor: (saving || !result) ? 'not-allowed' : 'pointer',
              }}
            >
              {saving ? 'Saving…' : 'Save'}
            </button>
            <button
              onClick={onClose}
              style={{ padding: '9px 16px', flexShrink: 0, background: 'transparent', border: `1px solid ${C.border}`, borderRadius: C.rs, fontSize: 13, color: C.muted, cursor: 'pointer' }}
            >
              Cancel
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Saved simulation card ─────────────────────────────────────────────────────
function SnapCard({ snap, onOpen, onDelete }) {
  const icon  = { compound_interest: '📈', stock_market: '📊', debt_payoff: '💳', emergency_fund: '🛡️' }[snap.scenario_type] || '📐';
  const label = TYPE_LABEL[snap.scenario_type] || snap.scenario_type;
  return (
    <div style={{ background: C.surface, borderRadius: C.r, border: `1px solid ${C.border}`, boxShadow: C.shadowSm, padding: '16px 20px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <span style={{ fontSize: 18 }}>{icon}</span>
          <div>
            <div style={{ fontSize: 14, fontWeight: 700, color: C.ink }}>{snap.name}</div>
            <div style={{ fontSize: 11, color: C.muted }}>{label}</div>
          </div>
        </div>
        <div style={{ fontSize: 10, color: C.faint }}>
          {new Date(snap.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
        </div>
      </div>
      <div style={{ fontSize: 13, fontWeight: 700, color: C.brand, marginBottom: 12 }}>
        {outcomeLabel(snap)}
      </div>
      <div style={{ display: 'flex', gap: 8 }}>
        <button
          onClick={() => onOpen(snap)}
          style={{ flex: 1, padding: '7px 0', background: 'transparent', border: `1px solid ${C.border}`, borderRadius: C.rs, fontSize: 12, fontWeight: 600, color: C.ink, cursor: 'pointer' }}
          onMouseEnter={e => { e.currentTarget.style.borderColor = C.brand; e.currentTarget.style.color = C.brand; }}
          onMouseLeave={e => { e.currentTarget.style.borderColor = C.border; e.currentTarget.style.color = C.ink; }}
        >
          Open
        </button>
        <button
          onClick={() => onDelete(snap)}
          style={{ flex: 1, padding: '7px 0', background: 'transparent', border: '1px solid rgba(220,38,38,0.2)', borderRadius: C.rs, fontSize: 12, fontWeight: 600, color: C.danger, cursor: 'pointer' }}
          onMouseEnter={e => { e.currentTarget.style.background = 'rgba(220,38,38,0.06)'; }}
          onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}
        >
          Delete
        </button>
      </div>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────
export default function SimulationsPage() {
  const navigate = useNavigate();
  const [profile,  setProfile]  = useState(null);
  const [prefill,  setPrefill]  = useState(null);
  const [snaps,    setSnaps]    = useState([]);
  const [loading,  setLoading]  = useState(true);
  const [isDemo,   setIsDemo]   = useState(false);
  const [showBuilder, setShowBuilder]   = useState(false);
  const [editSnap,    setEditSnap]      = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);

  const loadSnaps = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await getSnapshots();
      setSnaps(data.snapshots || []);
      setIsDemo(data.source === 'demo');
    } catch {
      setSnaps([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    getProfile().then(r => setProfile(r.data)).catch(() => {});
    getPreFill().then(({ data }) => setPrefill(data)).catch(() => {});
    loadSnaps();
  }, []);

  const handleLogout = async () => {
    try { await logoutApi(); } catch (_) {}
    localStorage.removeItem('token');
    navigate('/login');
  };

  const openNew = () => { setEditSnap(null); setShowBuilder(true); };
  const openSnap = (snap) => { setEditSnap(snap); setShowBuilder(true); };

  const handleSaved = (snapshot) => {
    setShowBuilder(false);
    setIsDemo(false);
    setSnaps(prev => {
      const exists = prev.find(s => s.sim_id === snapshot.sim_id);
      if (exists) return prev.map(s => s.sim_id === snapshot.sim_id ? snapshot : s);
      return [snapshot, ...prev.filter(s => !String(s.sim_id).startsWith('demo-'))];
    });
  };

  const handleDeleteConfirm = async () => {
    if (!deleteTarget) return;
    if (isDemo || String(deleteTarget.sim_id).startsWith('demo-')) {
      setSnaps(s => s.filter(x => x.sim_id !== deleteTarget.sim_id));
      setDeleteTarget(null);
      return;
    }
    try {
      await deleteSnapshot(deleteTarget.sim_id);
      setSnaps(s => s.filter(x => x.sim_id !== deleteTarget.sim_id));
    } catch { alert('Failed to delete.'); }
    setDeleteTarget(null);
  };

  const irScore = prefill?.investment_readiness_score;

  return (
    <div style={{ minHeight: '100vh', background: C.bg, fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif' }}>
      <AppHeader profile={profile} onLogout={handleLogout} liveData={!isDemo} isDemo={isDemo} />

      <div style={{ maxWidth: 860, margin: '0 auto', padding: '40px 24px 64px' }}>

        {/* Back */}
        <button
          onClick={() => navigate('/dashboard')}
          style={{ background: 'transparent', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, fontWeight: 600, color: C.muted, padding: 0, marginBottom: 28 }}
          onMouseEnter={e => { e.currentTarget.style.color = C.brand; }}
          onMouseLeave={e => { e.currentTarget.style.color = C.muted; }}
        >
          ← Back to Dashboard
        </button>

        {/* Title row */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20 }}>
          <div>
            <h1 style={{ fontSize: 26, fontWeight: 800, color: C.ink, margin: '0 0 4px', letterSpacing: '-0.025em' }}>Simulations</h1>
            <p style={{ margin: 0, fontSize: 13, color: C.muted }}>Model what-if investment and savings scenarios</p>
          </div>
          <button
            onClick={openNew}
            style={{ padding: '10px 20px', background: C.brand, color: '#fff', border: 'none', borderRadius: C.rs, fontSize: 13, fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap' }}
            onMouseEnter={e => { e.currentTarget.style.background = C.brand2; }}
            onMouseLeave={e => { e.currentTarget.style.background = C.brand; }}
          >
            + Run New Simulation
          </button>
        </div>

        {/* IR score note */}
        {irScore !== null && irScore !== undefined && (
          <div style={{ padding: '12px 16px', borderRadius: C.rs, marginBottom: 20, background: 'rgba(26,77,62,0.06)', border: '1px solid rgba(26,77,62,0.15)', fontSize: 13, color: C.ink }}>
            <strong>Investment Readiness Score: {irScore}/100</strong>
            {irScore >= 80 && ' — You are in a strong position. Consider growth-oriented simulations.'}
            {irScore >= 50 && irScore < 80 && ' — Moderate readiness. Use conservative return rate assumptions.'}
            {irScore < 50 && ' — Focus on emergency fund and debt payoff scenarios first.'}
          </div>
        )}

        {/* Snapshots grid */}
        {loading ? (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))', gap: 16 }}>
            {[1, 2, 3].map(i => (
              <div key={i} style={{
                height: 140, borderRadius: C.r,
                background: 'linear-gradient(90deg, #e8ede9 0%, #d4ddd8 50%, #e8ede9 100%)',
                backgroundSize: '400px 100%', animation: 'ff-shimmer 1.4s ease infinite',
              }} />
            ))}
          </div>
        ) : snaps.length === 0 ? (
          <div style={{ background: C.surface, borderRadius: C.r, border: `1px solid ${C.border}`, padding: '48px 24px', textAlign: 'center' }}>
            <div style={{ fontSize: 40 }}>📐</div>
            <div style={{ fontSize: 16, fontWeight: 700, color: C.ink, marginTop: 12 }}>No simulations yet</div>
            <div style={{ fontSize: 13, color: C.muted, marginTop: 6, marginBottom: 20 }}>Run your first scenario to model savings, investments, or debt payoff</div>
            <button onClick={openNew} style={{ padding: '10px 24px', background: C.brand, color: '#fff', border: 'none', borderRadius: C.rs, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
              + Run First Simulation
            </button>
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))', gap: 16 }}>
            {snaps.map((s, i) => (
              <SnapCard key={s.sim_id || i} snap={s} onOpen={openSnap} onDelete={setDeleteTarget} />
            ))}
          </div>
        )}
      </div>

      {/* Builder modal */}
      {showBuilder && (
        <SimulationBuilder
          prefill={prefill}
          initialSnap={editSnap}
          onSaved={handleSaved}
          onClose={() => setShowBuilder(false)}
        />
      )}

      {/* Delete confirm */}
      {deleteTarget && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 200, background: 'rgba(2,5,12,0.75)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
          <div style={{ background: C.surface, borderRadius: C.r, border: `1px solid ${C.border}`, boxShadow: C.shadow, padding: '28px', maxWidth: 380, width: '100%' }}>
            <div style={{ fontSize: 16, fontWeight: 700, color: C.ink, marginBottom: 8 }}>Delete Simulation?</div>
            <p style={{ margin: '0 0 20px', fontSize: 13, color: C.muted, lineHeight: 1.6 }}>
              Are you sure you want to delete <strong>{deleteTarget.name}</strong>? This cannot be undone.
            </p>
            <div style={{ display: 'flex', gap: 10 }}>
              <button onClick={() => setDeleteTarget(null)} style={{ flex: 1, padding: '9px 0', background: 'transparent', border: `1px solid ${C.border}`, borderRadius: C.rs, fontSize: 13, fontWeight: 600, color: C.muted, cursor: 'pointer' }}>
                Cancel
              </button>
              <button onClick={handleDeleteConfirm} style={{ flex: 1, padding: '9px 0', background: C.danger, color: '#fff', border: 'none', borderRadius: C.rs, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
