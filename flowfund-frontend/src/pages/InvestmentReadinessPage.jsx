import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { PieChart, Pie, Cell } from 'recharts';
import { getInvestmentReadiness, getStockIdeas } from '../api/investmentReadiness';
import { getProfile, logout as logoutApi } from '../api/auth';
import AppHeader from '../components/AppHeader';
import { C } from '../theme/flowfundTheme';

// ── Color map ─────────────────────────────────────────────────────────────────
const BAND_COLOR = { green: '#16a34a', yellow: '#d97706', red: '#dc2626' };
const BAND_BG    = { green: 'rgba(22,163,74,0.07)', yellow: 'rgba(217,119,6,0.07)', red: 'rgba(220,38,38,0.06)' };
const BAND_BORDER= { green: 'rgba(22,163,74,0.2)',  yellow: 'rgba(217,119,6,0.2)',  red: 'rgba(220,38,38,0.18)' };

const VERDICT_HEADING = {
  green:  'Your financial profile supports investing.',
  yellow: 'You can invest, but be aware of the risks.',
  red:    'We recommend you do not invest right now.',
};
const VERDICT_BODY = {
  green:  'Your income, savings rate, cash buffer, and spending consistency all meet healthy thresholds. You are in a strong position to begin or grow an investment portfolio.',
  yellow: 'Your finances show progress, but meaningful risk remains — particularly in your cash buffer or spending stability. Investing is possible, but prioritize shoring up your safety net first.',
  red:    'One or more critical financial factors are below safe levels. Building a stable financial base now will protect you from risk and set you up for long-term investment success.',
};

// ── Large donut ring ──────────────────────────────────────────────────────────
function ScoreRing({ score, band, size = 180 }) {
  const color  = BAND_COLOR[band] || C.muted;
  const filled = Math.max(0, Math.min(100, score));
  const data   = [{ value: filled }, { value: 100 - filled }];

  return (
    <div style={{ position: 'relative', width: size, height: size, flexShrink: 0 }}>
      <PieChart width={size} height={size}>
        <Pie
          data={data}
          cx={size / 2}
          cy={size / 2}
          innerRadius={size * 0.34}
          outerRadius={size * 0.46}
          startAngle={90}
          endAngle={-270}
          dataKey="value"
          strokeWidth={0}
        >
          <Cell fill={color} />
          <Cell fill="#e8ede9" />
        </Pie>
      </PieChart>
      <div style={{
        position: 'absolute', inset: 0,
        display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center',
        pointerEvents: 'none',
      }}>
        <span style={{ fontSize: size * 0.22, fontWeight: 800, color, lineHeight: 1, fontVariantNumeric: 'tabular-nums' }}>
          {score}
        </span>
        <span style={{ fontSize: size * 0.08, color: C.faint, fontWeight: 600, letterSpacing: '0.04em', marginTop: 3 }}>
          / 100
        </span>
      </div>
    </div>
  );
}

// ── Stock ideas (Alpha Vantage movers) ────────────────────────────────────────
function fmtVol(n) {
  if (n == null || Number.isNaN(n)) return '—';
  if (n >= 1e9) return `${(n / 1e9).toFixed(2)}B`;
  if (n >= 1e6) return `${(n / 1e6).toFixed(2)}M`;
  if (n >= 1e3) return `${(n / 1e3).toFixed(1)}K`;
  return String(n);
}

function StockIdeasSection({ data, loading, band }) {
  const navigate = useNavigate();
  const accent = BAND_COLOR[band] || C.brand;
  if (loading) {
    return (
      <div style={{
        background: C.surface, borderRadius: C.r,
        border: `1px solid ${C.border}`, boxShadow: C.shadowSm,
        padding: '20px 24px', marginBottom: '20px',
      }}>
        <div style={{ height: 14, width: '55%', borderRadius: 6, marginBottom: 14, background: 'linear-gradient(90deg, #e8ede9 0%, #d4ddd8 50%, #e8ede9 100%)', backgroundSize: '400px 100%', animation: 'ff-shimmer 1.4s ease infinite' }} />
        {[1, 2, 3].map((i) => (
          <div key={i} style={{ height: 48, borderRadius: 8, marginBottom: 8, background: 'linear-gradient(90deg, #e8ede9 0%, #d4ddd8 50%, #e8ede9 100%)', backgroundSize: '400px 100%', animation: 'ff-shimmer 1.4s ease infinite' }} />
        ))}
      </div>
    );
  }
  if (!data?.stocks?.length) return null;

  return (
    <div style={{
      background: C.surface, borderRadius: C.r,
      border: `1px solid ${C.border}`, boxShadow: C.shadowSm,
      overflow: 'hidden', marginBottom: '20px',
    }}>
      <div style={{
        padding: '18px 24px', borderBottom: `1px solid ${C.border}`,
        display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'flex-start', gap: '10px',
      }}>
        <div>
          <div style={{ fontSize: '16px', fontWeight: 700, color: C.ink }}>Ideas to research</div>
          <div style={{ fontSize: '12px', color: C.muted, marginTop: '4px', lineHeight: 1.5 }}>
            Top 3 liquid US names from Alpha Vantage <strong>most actively traded</strong> (plus fallbacks).
            {data.last_updated && (
              <span style={{ display: 'block', marginTop: 4, fontSize: '11px', color: C.faint }}>
                Market snapshot: {data.last_updated}
              </span>
            )}
          </div>
        </div>
        <span style={{
          fontSize: '10px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em',
          padding: '4px 10px', borderRadius: 20,
          background: data.source === 'alphavantage' ? 'rgba(22,163,74,0.09)' : 'rgba(100,116,139,0.12)',
          color: data.source === 'alphavantage' ? '#15803d' : C.muted,
          border: `1px solid ${data.source === 'alphavantage' ? 'rgba(22,163,74,0.25)' : C.border}`,
        }}>
          {data.source === 'alphavantage' ? 'Live movers' : 'Examples'}
        </span>
      </div>

      {data.notice && (
        <div style={{
          margin: '0 24px', marginTop: 14, padding: '10px 12px', borderRadius: C.rs,
          background: 'rgba(217,119,6,0.08)', border: '1px solid rgba(217,119,6,0.22)',
          fontSize: '12px', color: '#b45309', lineHeight: 1.5,
        }}>
          {data.notice}
        </div>
      )}

      <div style={{ padding: '12px 24px 20px' }}>
        {data.stocks.map((s, idx) => {
          const pct = s.changePercent != null && s.changePercent !== '' ? parseFloat(String(s.changePercent).replace(/,/g, '')) : null;
          const pctColor = pct == null || Number.isNaN(pct) ? C.muted : pct >= 0 ? '#16a34a' : '#dc2626';
          const pctStr = pct != null && !Number.isNaN(pct) ? `${pct >= 0 ? '+' : ''}${pct.toFixed(2)}%` : '—';
          return (
            <div
              key={s.symbol || idx}
              style={{
                display: 'flex', alignItems: 'center', gap: '14px',
                padding: '14px 0', borderBottom: idx < data.stocks.length - 1 ? `1px solid ${C.border}` : 'none',
              }}
            >
              <div style={{
                width: 36, height: 36, borderRadius: 10, flexShrink: 0,
                background: `${accent}18`, border: `1px solid ${accent}35`,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: '13px', fontWeight: 800, color: accent,
              }}>
                {idx + 1}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: '15px', fontWeight: 700, color: C.ink, fontVariantNumeric: 'tabular-nums' }}>
                  {s.symbol}
                </div>
                {s.name && (
                  <div style={{ fontSize: '12px', color: C.muted, marginTop: 2, lineHeight: 1.4 }}>{s.name}</div>
                )}
                {s.tag && (
                  <div style={{ fontSize: '10px', color: C.faint, marginTop: 4, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                    {s.tag}
                  </div>
                )}
              </div>
              <div style={{ textAlign: 'right', flexShrink: 0 }}>
                <div style={{ fontSize: '14px', fontWeight: 700, color: C.ink, fontVariantNumeric: 'tabular-nums' }}>
                  {s.price != null ? `$${Number(s.price).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : '—'}
                </div>
                <div style={{ fontSize: '12px', fontWeight: 600, color: pctColor, marginTop: 2 }}>
                  {pctStr}
                </div>
                <div style={{ fontSize: '10px', color: C.faint, marginTop: 2 }}>
                  Vol {fmtVol(s.volume)}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <div style={{
        padding: '12px 24px 16px', borderTop: `1px solid ${C.border}`,
        background: '#fafcfb',
      }}>
        <p style={{ margin: 0, fontSize: '11px', color: C.muted, lineHeight: 1.55 }}>
          {data.disclaimer}
        </p>
        <button
          type="button"
          onClick={() => navigate('/market')}
          style={{
            marginTop: 10, padding: 0, border: 'none', background: 'none',
            fontSize: '12px', fontWeight: 600, color: C.brand, cursor: 'pointer',
          }}
        >
          Open market lookup →
        </button>
      </div>
    </div>
  );
}

// ── Factor row ────────────────────────────────────────────────────────────────
function FactorRow({ factor }) {
  const positive = factor.contribution.startsWith('+0') ? false : true;
  return (
    <div style={{
      padding: '14px 0', borderBottom: `1px solid ${C.border}`,
      display: 'flex', gap: '14px', alignItems: 'flex-start',
    }}>
      <div style={{
        width: 28, height: 28, borderRadius: '8px', flexShrink: 0,
        background: positive ? 'rgba(22,163,74,0.1)' : 'rgba(220,38,38,0.07)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: '14px',
      }}>
        {positive ? '✓' : '✗'}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
          <span style={{ fontSize: '14px', fontWeight: 700, color: C.ink }}>{factor.label}</span>
          <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexShrink: 0 }}>
            <span style={{ fontSize: '13px', color: C.ink, fontVariantNumeric: 'tabular-nums', fontWeight: 500 }}>
              {factor.value}
            </span>
            <span style={{
              fontSize: '11px', fontWeight: 700,
              color: positive ? '#16a34a' : C.muted,
              background: positive ? 'rgba(22,163,74,0.09)' : '#f0f3f1',
              border: `1px solid ${positive ? 'rgba(22,163,74,0.22)' : C.border}`,
              borderRadius: '20px', padding: '1px 8px',
            }}>
              {factor.contribution}
            </span>
          </div>
        </div>
        <p style={{ margin: 0, fontSize: '12px', color: C.muted, lineHeight: 1.6 }}>
          {factor.explanation}
        </p>
      </div>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────
export default function InvestmentReadinessPage() {
  const navigate = useNavigate();
  const [profile, setProfile] = useState(null);
  const [data,    setData]    = useState(null);
  const [loading, setLoading] = useState(true);
  const [isDemo,  setIsDemo]  = useState(false);
  const [stockIdeas, setStockIdeas] = useState(null);
  const [ideasLoading, setIdeasLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    setIdeasLoading(true);
    Promise.all([
      getProfile().then((r) => setProfile(r.data)).catch(() => {}),
      getInvestmentReadiness()
        .then((r) => {
          setData(r.data);
          setIsDemo(r.data.source === 'demo');
        })
        .catch(() => setData(null)),
      getStockIdeas()
        .then((r) => setStockIdeas(r.data))
        .catch(() => setStockIdeas(null)),
    ]).finally(() => {
      setLoading(false);
      setIdeasLoading(false);
    });
  }, []);

  const handleLogout = async () => {
    try { await logoutApi(); } catch (_) {}
    localStorage.removeItem('token');
    navigate('/login');
  };

  const band  = data?.color_band || 'red';
  const color = BAND_COLOR[band] || C.muted;
  const noScoreData = data && (data.source === 'none' || data.score == null);

  return (
    <div style={{ minHeight: '100vh', background: C.bg, fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif' }}>
      <AppHeader
        profile={profile}
        onLogout={handleLogout}
        liveData={data?.source === 'db'}
        isDemo={isDemo}
      />

      <div style={{ maxWidth: '760px', margin: '0 auto', padding: '40px 24px 64px' }}>

        {/* Back */}
        <button
          onClick={() => navigate('/dashboard')}
          style={{
            background: 'transparent', border: 'none', cursor: 'pointer',
            display: 'flex', alignItems: 'center', gap: '6px',
            fontSize: '13px', fontWeight: 600, color: C.muted, padding: 0, marginBottom: '28px',
          }}
          onMouseEnter={e => { e.currentTarget.style.color = C.brand; }}
          onMouseLeave={e => { e.currentTarget.style.color = C.muted; }}
        >
          ← Back to Dashboard
        </button>

        {/* Page title */}
        <h1 style={{ fontSize: '26px', fontWeight: 800, color: C.ink, margin: '0 0 24px', letterSpacing: '-0.025em' }}>
          Investment Readiness
        </h1>

        {loading ? (
          /* Shimmer */
          <div style={{ background: C.surface, borderRadius: C.r, border: `1px solid ${C.border}`, padding: '32px' }}>
            {[100, 70, 85, 60, 90, 55].map((w, i) => (
              <div key={i} style={{
                height: 18, borderRadius: '6px', marginBottom: '16px', width: `${w}%`,
                background: 'linear-gradient(90deg, #e8ede9 0%, #d4ddd8 50%, #e8ede9 100%)',
                backgroundSize: '400px 100%',
                animation: 'ff-shimmer 1.4s ease infinite',
              }} />
            ))}
          </div>
        ) : !data ? (
          /* Error state */
          <div style={{
            background: C.surface, borderRadius: C.r, border: `1px solid ${C.border}`,
            padding: '40px', textAlign: 'center',
          }}>
            <div style={{ fontSize: '40px' }}>📊</div>
            <div style={{ fontSize: '16px', fontWeight: 600, color: C.ink, marginTop: '12px' }}>Score Unavailable</div>
            <div style={{ fontSize: '13px', color: C.muted, marginTop: '6px' }}>
              Connect a bank account and import transactions to generate your score.
            </div>
          </div>
        ) : noScoreData ? (
          <div style={{
            background: C.surface, borderRadius: C.r, border: `1px solid ${C.border}`,
            padding: '48px 32px', textAlign: 'center',
          }}>
            <div style={{ fontSize: '44px' }}>🏦</div>
            <div style={{ fontSize: '17px', fontWeight: 700, color: C.ink, marginTop: '14px' }}>
              No accounts connected
            </div>
            <div style={{ fontSize: '14px', color: C.muted, marginTop: '8px', lineHeight: 1.6, maxWidth: '400px', margin: '8px auto 0' }}>
              {data.message || 'Connect your bank on the dashboard and sync transactions to generate your investment readiness score.'}
            </div>
          </div>
        ) : (
          <>
            {/* ── Score + Verdict card ─────────────────────────────────────── */}
            <div style={{
              background: C.surface, borderRadius: C.r,
              border: `1px solid ${C.border}`, boxShadow: C.shadow,
              overflow: 'hidden', marginBottom: '20px',
            }}>
              <div style={{ height: '4px', background: `linear-gradient(90deg, ${color} 0%, ${color}88 100%)` }} />
              <div style={{ padding: '28px 28px', display: 'flex', gap: '28px', alignItems: 'center', flexWrap: 'wrap' }}>
                <ScoreRing score={data.score} band={band} size={160} />
                <div style={{ flex: 1, minWidth: '200px' }}>
                  {isDemo && (
                    <span style={{
                      display: 'inline-block', marginBottom: '10px',
                      padding: '2px 9px', borderRadius: '20px',
                      background: 'rgba(217,119,6,0.09)', border: '1px solid rgba(217,119,6,0.25)',
                      fontSize: '10px', fontWeight: 700, color: '#d97706',
                    }}>
                      DEMO
                    </span>
                  )}
                  <h2 style={{ fontSize: '18px', fontWeight: 800, color, margin: '0 0 10px', lineHeight: 1.3 }}>
                    {VERDICT_HEADING[band]}
                  </h2>
                  <p style={{ margin: 0, fontSize: '13px', color: C.muted, lineHeight: 1.7 }}>
                    {VERDICT_BODY[band]}
                  </p>
                  <div style={{ marginTop: '14px' }}>
                    <span style={{
                      padding: '4px 14px', borderRadius: '20px',
                      background: BAND_BG[band], border: `1px solid ${BAND_BORDER[band]}`,
                      fontSize: '12px', fontWeight: 700, color,
                    }}>
                      {data.verdict}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* ── Factor breakdown ─────────────────────────────────────────── */}
            <div style={{
              background: C.surface, borderRadius: C.r,
              border: `1px solid ${C.border}`, boxShadow: C.shadowSm,
              overflow: 'hidden', marginBottom: '20px',
            }}>
              <div style={{ padding: '18px 24px', borderBottom: `1px solid ${C.border}` }}>
                <div style={{ fontSize: '16px', fontWeight: 700, color: C.ink }}>Score Breakdown</div>
                <div style={{ fontSize: '12px', color: C.muted, marginTop: '2px' }}>
                  How each factor contributed to your score
                </div>
              </div>
              <div style={{ padding: '0 24px' }}>
                {(data.factors || []).map((f, i) => (
                  <FactorRow key={i} factor={f} />
                ))}
              </div>
            </div>

            <StockIdeasSection data={stockIdeas} loading={ideasLoading} band={band} />

            {/* ── Recommendation ───────────────────────────────────────────── */}
            <div style={{
              background: BAND_BG[band],
              borderRadius: C.r,
              border: `1px solid ${BAND_BORDER[band]}`,
              padding: '20px 24px',
            }}>
              <div style={{ fontSize: '14px', fontWeight: 700, color, marginBottom: '8px' }}>
                {band === 'green' ? '✓ Recommendation' : band === 'yellow' ? '⚠ Recommendation' : '✗ Recommendation'}
              </div>
              <p style={{ margin: 0, fontSize: '13px', color: C.ink, lineHeight: 1.7 }}>
                {data.recommendation}
              </p>
            </div>

            {/* ── Last computed ─────────────────────────────────────────────── */}
            <div style={{ marginTop: '16px', textAlign: 'right', fontSize: '11px', color: C.faint }}>
              Score computed {new Date(data.computed_at).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })}
              {' · Source: '}{data.source}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
