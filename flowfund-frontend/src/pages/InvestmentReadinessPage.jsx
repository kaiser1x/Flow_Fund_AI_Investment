import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { PieChart, Pie, Cell } from 'recharts';
import { getInvestmentReadiness } from '../api/investmentReadiness';
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

  useEffect(() => {
    Promise.all([
      getProfile().then(r => setProfile(r.data)).catch(() => {}),
      getInvestmentReadiness()
        .then(r => {
          setData(r.data);
          setIsDemo(r.data.source === 'demo');
        })
        .catch(() => setData(null)),
    ]).finally(() => setLoading(false));
  }, []);

  const handleLogout = async () => {
    try { await logoutApi(); } catch (_) {}
    localStorage.removeItem('token');
    navigate('/login');
  };

  const band  = data?.color_band || 'red';
  const color = BAND_COLOR[band] || C.muted;

  return (
    <div style={{ minHeight: '100vh', background: C.bg, fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif' }}>
      <AppHeader profile={profile} onLogout={handleLogout} liveData={!isDemo} isDemo={isDemo} />

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
