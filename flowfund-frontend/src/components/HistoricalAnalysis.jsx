import { useState, useEffect, useCallback } from 'react';
import {
  ResponsiveContainer,
  ComposedChart,
  BarChart,
  Bar,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from 'recharts';
import { getHistoricalAnalysis } from '../api/transactions';
import { C } from '../theme/flowfundTheme';

// ─── Helpers ─────────────────────────────────────────────────────────────────
function fmtMoney(n) {
  return '$' + Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
}

function fmtMoneyAxis(v) {
  if (Math.abs(v) >= 1000) return '$' + (v / 1000).toFixed(0) + 'k';
  return '$' + v;
}

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function sixMonthsAgoIso() {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth() - 5, 1).toISOString().slice(0, 10);
}

const RISK_COLOR = { HIGH: C.income, MEDIUM: C.warning, LOW: C.danger };

// ─── Sub-components ───────────────────────────────────────────────────────────
function SummaryBadge({ label, value, color }) {
  return (
    <div style={{
      flex: '1 1 130px', padding: '12px 16px', borderRadius: C.rs,
      background: 'rgba(255,255,255,0.04)', border: `1px solid ${C.border}`,
      display: 'flex', flexDirection: 'column', gap: '4px',
    }}>
      <span style={{
        fontSize: '11px', fontWeight: 700, color: C.faint,
        textTransform: 'uppercase', letterSpacing: '0.07em',
      }}>
        {label}
      </span>
      <span style={{
        fontSize: '18px', fontWeight: 800,
        color: color || C.ink,
        letterSpacing: '-0.02em', fontVariantNumeric: 'tabular-nums',
      }}>
        {value}
      </span>
    </div>
  );
}

function CashFlowTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  return (
    <div style={{
      background: C.surface, border: `1px solid ${C.border}`,
      borderRadius: 8, padding: '10px 12px',
      fontSize: 12, boxShadow: C.shadowSm,
    }}>
      <div style={{ fontWeight: 700, color: C.ink, marginBottom: 6 }}>{label}</div>
      {payload.map(p => (
        <div key={p.dataKey} style={{ color: p.color, marginBottom: 2 }}>
          {p.name}: {fmtMoney(p.value)}
        </div>
      ))}
    </div>
  );
}

function ReadinessTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  const row = payload[0]?.payload;
  return (
    <div style={{
      background: C.surface, border: `1px solid ${C.border}`,
      borderRadius: 8, padding: '8px 12px',
      fontSize: 12, boxShadow: C.shadowSm,
    }}>
      <div style={{ fontWeight: 700, color: C.ink, marginBottom: 4 }}>{label}</div>
      <div style={{ color: C.brand2 }}>Score: {row?.score} / 100</div>
      <div style={{ color: RISK_COLOR[row?.riskLevel] || C.muted }}>
        Risk: {row?.riskLevel}
      </div>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────
export default function HistoricalAnalysis({ isDemo }) {
  const [startDate, setStartDate] = useState(sixMonthsAgoIso);
  const [endDate,   setEndDate]   = useState(todayIso);
  const [granularity, setGranularity] = useState('monthly');
  const [data,    setData]    = useState(null);
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState('');

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const { data: res } = await getHistoricalAnalysis({ startDate, endDate, granularity });
      setData(res);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to load historical analysis');
    } finally {
      setLoading(false);
    }
  }, [startDate, endDate, granularity]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const hasSeriesData = data?.hasData && data?.series?.length > 0;

  return (
    <div style={{
      background: C.surface, borderRadius: C.r,
      border: `1px solid ${C.border}`, boxShadow: C.shadow,
      overflow: 'hidden',
    }}>
      {/* ── Header ── */}
      <div style={{
        padding: '18px 24px', borderBottom: `1px solid ${C.border}`,
        display: 'flex', justifyContent: 'space-between',
        alignItems: 'center', flexWrap: 'wrap', gap: '12px',
      }}>
        <div>
          <div style={{ fontSize: '16px', fontWeight: 700, color: C.ink }}>
            Historical Analysis
          </div>
          <div style={{ fontSize: '12px', color: C.muted, marginTop: '2px' }}>
            Income, spending, and readiness trends over time
          </div>
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

      <div style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: '20px' }}>

        {/* ── Controls ── */}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px', alignItems: 'flex-end' }}>
          {[
            { id: 'ha-start', label: 'From', value: startDate, max: endDate,   min: undefined, setter: setStartDate },
            { id: 'ha-end',   label: 'To',   value: endDate,   max: undefined, min: startDate, setter: setEndDate   },
          ].map(({ id, label, value, max, min, setter }) => (
            <div key={id} style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
              <label
                htmlFor={id}
                style={{ fontSize: '11px', fontWeight: 700, color: C.faint, textTransform: 'uppercase', letterSpacing: '0.07em' }}
              >
                {label}
              </label>
              <input
                id={id}
                type="date"
                value={value}
                max={max}
                min={min}
                onChange={e => setter(e.target.value)}
                style={{
                  padding: '6px 10px', borderRadius: C.rs,
                  border: `1px solid ${C.border}`,
                  fontSize: '13px', color: C.ink,
                  background: 'rgba(255,255,255,0.04)', outline: 'none', color: 'inherit',
                }}
              />
            </div>
          ))}

          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
            <span style={{ fontSize: '11px', fontWeight: 700, color: C.faint, textTransform: 'uppercase', letterSpacing: '0.07em' }}>
              View
            </span>
            <div style={{ display: 'flex', gap: '6px' }}>
              {['monthly', 'weekly'].map(g => (
                <button
                  key={g}
                  onClick={() => setGranularity(g)}
                  style={{
                    padding: '6px 14px', borderRadius: C.rs, cursor: 'pointer',
                    border: `1px solid ${granularity === g ? C.brand : C.border}`,
                    background: granularity === g ? C.brand : '#f8faf9',
                    color: granularity === g ? '#fff' : C.ink,
                    fontSize: '13px', fontWeight: 600,
                  }}
                >
                  {g.charAt(0).toUpperCase() + g.slice(1)}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* ── Loading ── */}
        {loading && (
          <div style={{ textAlign: 'center', padding: '32px 0', color: C.muted, fontSize: '14px' }}>
            Loading historical data…
          </div>
        )}

        {/* ── Error ── */}
        {!loading && error && (
          <div style={{
            padding: '12px 16px', borderRadius: C.rs,
            background: 'rgba(220,38,38,0.06)', border: '1px solid rgba(220,38,38,0.18)',
            fontSize: '13px', color: C.danger,
          }}>
            {error}
          </div>
        )}

        {/* ── No linked accounts ── */}
        {!loading && !error && data && !data.hasData && (
          <div style={{ padding: '28px 0', textAlign: 'center', color: C.faint, fontSize: '14px' }}>
            {data.reason || 'Connect a bank account to see historical analysis.'}
          </div>
        )}

        {/* ── Empty range ── */}
        {!loading && !error && data?.hasData && data.series?.length === 0 && (
          <div style={{ padding: '28px 0', textAlign: 'center', color: C.faint, fontSize: '14px' }}>
            No transaction data found for the selected date range.
          </div>
        )}

        {/* ── Warnings ── */}
        {!loading && data?.warnings?.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            {data.warnings.map((w, i) => (
              <div key={i} style={{
                padding: '8px 12px', borderRadius: C.rs,
                background: 'rgba(217,119,6,0.07)', border: '1px solid rgba(217,119,6,0.2)',
                fontSize: '12px', color: C.warning,
              }}>
                {w}
              </div>
            ))}
          </div>
        )}

        {/* ── Main charts ── */}
        {!loading && hasSeriesData && (
          <>
            {/* Summary badges */}
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px' }}>
              <SummaryBadge label="Total Income"       value={fmtMoney(data.summary.totalIncome)}   color={C.income} />
              <SummaryBadge label="Total Expenses"     value={fmtMoney(data.summary.totalExpenses)} color={C.expense} />
              <SummaryBadge
                label="Net Cash Flow"
                value={(data.summary.netCashFlow >= 0 ? '+' : '−') + fmtMoney(data.summary.netCashFlow)}
                color={data.summary.netCashFlow >= 0 ? C.income : C.expense}
              />
              <SummaryBadge label="Avg Income / Period"  value={fmtMoney(data.summary.averageIncomePerPeriod)}   color={C.ink} />
              <SummaryBadge label="Avg Expense / Period" value={fmtMoney(data.summary.averageExpensePerPeriod)} color={C.ink} />
            </div>

            {/* Income vs Expenses bar + net line */}
            <div>
              <div style={{ fontSize: '14px', fontWeight: 700, color: C.ink, marginBottom: '12px' }}>
                Income vs Expenses — by {granularity === 'monthly' ? 'Month' : 'Week'}
              </div>
              <ResponsiveContainer width="100%" height={220}>
                <ComposedChart data={data.series} margin={{ top: 4, right: 8, left: 0, bottom: 4 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke={C.chartGrid} />
                  <XAxis dataKey="period" tick={{ fontSize: 11, fill: C.muted }} />
                  <YAxis tick={{ fontSize: 11, fill: C.muted }} tickFormatter={fmtMoneyAxis} />
                  <Tooltip content={<CashFlowTooltip />} />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  <Bar dataKey="income"   name="Income"   fill={C.income}  radius={[3, 3, 0, 0]} maxBarSize={40} />
                  <Bar dataKey="expenses" name="Expenses" fill={C.expense} radius={[3, 3, 0, 0]} maxBarSize={40} />
                  <Line dataKey="netCashFlow" name="Net Flow" stroke={C.brand} strokeWidth={2} dot={false} />
                </ComposedChart>
              </ResponsiveContainer>
            </div>

            {/* Category breakdown (horizontal bars) */}
            {data.categories?.length > 0 && (
              <div>
                <div style={{ fontSize: '14px', fontWeight: 700, color: C.ink, marginBottom: '12px' }}>
                  Expense Categories
                </div>
                <ResponsiveContainer width="100%" height={Math.max(180, data.categories.length * 36)}>
                  <BarChart
                    data={data.categories}
                    layout="vertical"
                    margin={{ top: 4, right: 32, left: 8, bottom: 4 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke={C.chartGrid} horizontal={false} />
                    <XAxis
                      type="number"
                      tick={{ fontSize: 11, fill: C.muted }}
                      tickFormatter={fmtMoneyAxis}
                    />
                    <YAxis
                      type="category"
                      dataKey="category"
                      tick={{ fontSize: 11, fill: C.ink }}
                      width={120}
                    />
                    <Tooltip formatter={v => [fmtMoney(v), 'Total Spent']} />
                    <Bar dataKey="total" name="Total Spent" fill={C.brand2} radius={[0, 3, 3, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}

            {/* Readiness score history */}
            {data.readinessHistory?.length > 0 && (
              <div>
                <div style={{ fontSize: '14px', fontWeight: 700, color: C.ink, marginBottom: '12px' }}>
                  Investment Readiness Score History
                </div>
                <ResponsiveContainer width="100%" height={160}>
                  <ComposedChart data={data.readinessHistory} margin={{ top: 4, right: 8, left: 0, bottom: 4 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke={C.chartGrid} />
                    <XAxis dataKey="date" tick={{ fontSize: 10, fill: C.muted }} />
                    <YAxis domain={[0, 100]} tick={{ fontSize: 11, fill: C.muted }} />
                    <Tooltip content={<ReadinessTooltip />} />
                    <Line
                      dataKey="score"
                      name="Readiness Score"
                      stroke={C.accent}
                      strokeWidth={2}
                      dot={{ fill: C.accent, r: 3 }}
                    />
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
