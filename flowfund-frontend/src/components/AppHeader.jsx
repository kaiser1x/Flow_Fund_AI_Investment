import { NavLink, useNavigate } from 'react-router-dom';
import { C } from '../theme/flowfundTheme';
import NotificationBell from './NotificationBell';

export function LogoMark() {
  return (
    <div
      style={{
        width: 34,
        height: 34,
        borderRadius: '10px',
        flexShrink: 0,
        background: `linear-gradient(135deg, #0d1b2a 0%, #1a3a5c 100%)`,
        display: 'flex',
        alignItems: 'flex-end',
        justifyContent: 'center',
        padding: '7px 8px 6px',
        gap: '3px',
      }}
    >
      {[7, 14, 10, 5].map((h, i) => (
        <div
          key={i}
          style={{
            width: 4,
            height: h,
            borderRadius: '2px 2px 1px 1px',
            background: i === 1 ? C.accent : 'rgba(255,255,255,0.65)',
          }}
        />
      ))}
    </div>
  );
}

export default function AppHeader({ profile, onLogout, liveData, isDemo = false }) {
  const navigate = useNavigate();
  const name = [profile?.first_name, profile?.last_name].filter(Boolean).join(' ') || 'User';
  const initials = [profile?.first_name, profile?.last_name]
    .filter(Boolean)
    .map((n) => n[0]?.toUpperCase())
    .join('') || 'FF';

  const navLink = ({ isActive }) => ({
    fontSize: '13px',
    fontWeight: 600,
    color: isActive ? C.brand : C.muted,
    textDecoration: 'none',
    padding: '6px 14px',
    borderRadius: '8px',
    background: isActive ? C.accentFade : 'transparent',
    border: `1px solid ${isActive ? 'rgba(46,204,138,0.25)' : 'transparent'}`,
  });

  return (
    <header
      style={{
        position: 'sticky',
        top: 0,
        zIndex: 50,
        minHeight: '64px',
        flexWrap: 'wrap',
        rowGap: 10,
        background: 'rgba(5,11,20,0.88)',
        backdropFilter: 'blur(20px)',
        WebkitBackdropFilter: 'blur(20px)',
        borderBottom: `1px solid ${C.border}`,
        display: 'flex',
        alignItems: 'center',
        padding: '12px 40px',
        gap: '16px',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flex: 1, minWidth: 0 }}>
        <LogoMark />
        <div style={{ minWidth: 0 }}>
          <div
            style={{
              fontSize: '15px',
              fontWeight: 800,
              color: C.ink,
              letterSpacing: '-0.02em',
              lineHeight: 1.1,
            }}
          >
            FLOWFUND<span style={{ color: C.accent, marginLeft: '2px' }}>AI</span>
          </div>
          <div
            style={{
              fontSize: '9px',
              color: C.faint,
              letterSpacing: '0.14em',
              textTransform: 'uppercase',
            }}
          >
            Financial Platform
          </div>
        </div>
      </div>

      <nav style={{ display: 'flex', alignItems: 'center', gap: '6px', flexShrink: 0 }}>
        <NavLink to="/dashboard" style={navLink} end>
          Dashboard
        </NavLink>
        <NavLink to="/market" style={navLink}>
          Market Analysis
        </NavLink>
      </nav>

      <NotificationBell isDemo={isDemo} />

      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '6px',
          padding: '4px 12px',
          borderRadius: '20px',
          background: liveData ? 'rgba(22,163,74,0.08)' : 'rgba(217,119,6,0.08)',
          border: `1px solid ${liveData ? 'rgba(22,163,74,0.2)' : 'rgba(217,119,6,0.2)'}`,
          fontSize: '11px',
          fontWeight: 600,
          color: liveData ? C.success : C.warning,
          flexShrink: 0,
        }}
      >
        <div
          style={{
            width: 6,
            height: 6,
            borderRadius: '50%',
            background: liveData ? C.success : C.warning,
          }}
        />
        {liveData ? 'Live Data' : 'Demo Mode'}
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexShrink: 0 }}>
        {/* Avatar + name — clicking navigates to /profile (no visual change) */}
        <button
          type="button"
          onClick={() => navigate('/profile')}
          style={{
            display: 'flex', alignItems: 'center', gap: '8px',
            background: 'transparent', border: 'none', cursor: 'pointer',
            padding: 0,
          }}
          title="View profile"
        >
          <div
            style={{
              width: 32,
              height: 32,
              borderRadius: '50%',
              flexShrink: 0,
              background: 'rgba(46,204,138,0.15)',
              border: '2px solid rgba(46,204,138,0.35)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '12px',
              fontWeight: 700,
              color: C.brand,
            }}
          >
            {initials}
          </div>
          <span
            style={{
              fontSize: '13px',
              color: C.ink,
              fontWeight: 500,
              whiteSpace: 'nowrap',
              maxWidth: '140px',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              opacity: 0.85,
            }}
          >
            {name}
          </span>
        </button>
        <button
          type="button"
          onClick={onLogout}
          style={{
            padding: '6px 14px',
            background: 'transparent',
            border: `1.5px solid ${C.border}`,
            borderRadius: '8px',
            fontSize: '13px',
            fontWeight: 600,
            color: C.muted,
            cursor: 'pointer',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.borderColor = C.accent;
            e.currentTarget.style.color = C.accent;
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.borderColor = C.border;
            e.currentTarget.style.color = C.muted;
          }}
        >
          Log out
        </button>
      </div>
    </header>
  );
}
