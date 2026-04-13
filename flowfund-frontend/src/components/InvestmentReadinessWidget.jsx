import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { PieChart, Pie, Cell } from 'recharts';
import { getInvestmentReadiness } from '../api/investmentReadiness';
import { C } from '../theme/flowfundTheme';

// ── Color map (spec-defined) ──────────────────────────────────────────────────
const BAND_COLOR = { green: '#34d399', yellow: '#fbbf24', red: '#f87171' };

const TOOLTIP_TEXT = {
  green:  'Your score indicates your finances are in a healthy position for investing.',
  yellow: 'Your score shows you can invest, but proceed with caution. Meaningful financial risk is still present.',
  red:    'Your score suggests high financial risk. We recommend stabilizing your spending and savings before investing.',
};

// ── Donut ring using recharts PieChart (already in project) ──────────────────
function ScoreRing({ score, band, size = 120 }) {
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
          <Cell fill="rgba(255,255,255,0.07)" />
        </Pie>
      </PieChart>
      {/* Score label inside ring */}
      <div style={{
        position: 'absolute', inset: 0,
        display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center',
        pointerEvents: 'none',
      }}>
        <span style={{ fontSize: size * 0.22, fontWeight: 800, color, lineHeight: 1, fontVariantNumeric: 'tabular-nums' }}>
          {score}
        </span>
        <span style={{ fontSize: size * 0.09, color: C.faint, fontWeight: 600, letterSpacing: '0.04em', marginTop: 2 }}>
          /100
        </span>
      </div>
    </div>
  );
}

// ── Widget ────────────────────────────────────────────────────────────────────
export default function InvestmentReadinessWidget({ refreshToken = 0 }) {
  const navigate = useNavigate();
  const [data,    setData]    = useState(null);
  const [loading, setLoading] = useState(true);
  const [hovered, setHovered] = useState(false);

  useEffect(() => {
    setLoading(true);
    getInvestmentReadiness()
      .then(({ data: d }) => setData(d))
      .catch(() => setData(null))
      .finally(() => setLoading(false));
  }, [refreshToken]);

  const noData = data?.source === 'none' || data?.score == null;
  const band  = data?.color_band || 'red';
  const color = BAND_COLOR[band] || C.muted;

  return (
    <div
      onClick={() => navigate('/investment-readiness')}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      title={TOOLTIP_TEXT[band]}
      style={{
        background: C.surface, borderRadius: C.r,
        border: `1px solid ${hovered ? color + '55' : C.border}`,
        boxShadow: hovered ? `0 4px 16px ${color}22` : C.shadowSm,
        padding: '20px 22px',
        display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '12px',
        cursor: 'pointer',
        transition: 'border-color 0.15s, box-shadow 0.15s',
        position: 'relative',
        overflow: 'visible',
      }}
    >
      {/* Section label */}
      <div style={{
        width: '100%', display: 'flex', justifyContent: 'space-between', alignItems: 'center',
      }}>
        <span style={{ fontSize: '11px', fontWeight: 700, color: C.faint, textTransform: 'uppercase', letterSpacing: '0.08em' }}>
          Investment Readiness
        </span>
        <span style={{ fontSize: '11px', color: C.faint }}>→</span>
      </div>

      {loading ? (
        /* Shimmer */
        <div style={{
          width: 120, height: 120, borderRadius: '50%',
          background: 'linear-gradient(90deg, rgba(255,255,255,0.04) 0%, rgba(255,255,255,0.09) 50%, rgba(255,255,255,0.04) 100%)',
          backgroundSize: '400px 100%',
          animation: 'ff-shimmer 1.4s ease infinite',
        }} />
      ) : data === null ? (
        /* Unavailable state */
        <div style={{ textAlign: 'center', padding: '12px 0' }}>
          <div style={{ fontSize: '28px' }}>📊</div>
          <div style={{ fontSize: '12px', color: C.muted, marginTop: '6px' }}>Score unavailable</div>
        </div>
      ) : noData ? (
        <div style={{ textAlign: 'center', padding: '12px 8px' }}>
          <div style={{ fontSize: '26px' }}>🏦</div>
          <div style={{ fontSize: '12px', fontWeight: 600, color: C.ink, marginTop: '8px', lineHeight: 1.35 }}>
            No accounts connected
          </div>
          <div style={{ fontSize: '11px', color: C.muted, marginTop: '4px', lineHeight: 1.4 }}>
            Connect your bank to start
          </div>
        </div>
      ) : (
        <ScoreRing score={data.score} band={band} size={120} />
      )}

      {/* Verdict label */}
      {!loading && data && !noData && (
        <div style={{
          fontSize: '13px', fontWeight: 700, color,
          textAlign: 'center', lineHeight: 1.3,
        }}>
          {data.verdict}
        </div>
      )}

      {/* Tooltip overlay on hover */}
      {hovered && data && !noData && (
        <div style={{
          position: 'absolute', bottom: 'calc(100% + 8px)', left: '50%',
          transform: 'translateX(-50%)',
          width: 240,
          background: C.ink, color: '#fff',
          borderRadius: '10px', padding: '10px 14px',
          fontSize: '12px', lineHeight: 1.5,
          zIndex: 100, pointerEvents: 'none',
          boxShadow: '0 4px 16px rgba(0,0,0,0.18)',
        }}>
          {TOOLTIP_TEXT[band]}
          {/* Arrow */}
          <div style={{
            position: 'absolute', top: '100%', left: '50%', transform: 'translateX(-50%)',
            width: 0, height: 0,
            borderLeft: '6px solid transparent',
            borderRight: '6px solid transparent',
            borderTop: `6px solid ${C.ink}`,
          }} />
        </div>
      )}
    </div>
  );
}
