import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { resetPassword } from '../api/auth';

const styles = {
  layout: { display: 'flex', minHeight: '100vh', width: '100%' },
  leftPanel: {
    flex: '1',
    background: 'linear-gradient(160deg, #102222 0%, #0d2d1f 50%, #061a13 100%)',
    position: 'relative', overflow: 'hidden',
    display: 'flex', flexDirection: 'column', justifyContent: 'space-between', padding: '48px 40px',
  },
  shapes: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, pointerEvents: 'none', overflow: 'hidden' },
  shape1: { position: 'absolute', width: '320px', height: '320px', borderRadius: '50%', background: 'rgba(212,175,55,0.08)', top: '-80px', right: '-80px' },
  shape2: { position: 'absolute', width: '200px', height: '200px', borderRadius: '50%', background: 'rgba(26,77,62,0.6)', bottom: '20%', left: '-60px' },
  shape3: { position: 'absolute', width: '160px', height: '160px', borderRadius: '50%', background: 'rgba(212,175,55,0.06)', bottom: '40%', right: '15%' },
  logo: { display: 'flex', alignItems: 'center', gap: '10px', position: 'relative', zIndex: 1 },
  logoIcon: { width: '36px', height: '36px', border: '2px solid rgba(255,255,255,0.9)', borderRadius: '50%', position: 'relative' },
  logoIconInner: { position: 'absolute', width: '20px', height: '20px', border: '2px solid rgba(255,255,255,0.9)', borderRadius: '50%', top: '50%', left: '50%', transform: 'translate(-50%, -50%)' },
  logoText: { color: 'rgba(255,255,255,0.95)', fontSize: '18px', fontWeight: 700, letterSpacing: '0.05em' },
  centerBlock: { position: 'relative', zIndex: 1 },
  welcomeTitle: { color: '#fff', fontSize: '42px', fontWeight: 700, marginBottom: '12px', letterSpacing: '-0.02em' },
  welcomeSub: { color: 'rgba(255,255,255,0.85)', fontSize: '18px', fontWeight: 400 },
  siteUrl: { color: 'rgba(255,255,255,0.5)', fontSize: '13px', position: 'relative', zIndex: 1 },
  rightPanel: {
    width: '480px', minHeight: '100vh', background: '#050B14',
    display: 'flex', flexDirection: 'column', justifyContent: 'center',
    padding: '48px 56px', boxShadow: '-1px 0 0 rgba(255,255,255,0.07)',
  },
  formTitle: { fontSize: '28px', fontWeight: 700, color: '#E8F4F0', marginBottom: '8px' },
  subtitle: { fontSize: '14px', color: 'rgba(232,244,240,0.5)', marginBottom: '32px', lineHeight: 1.6 },
  inputWrap: { marginBottom: '24px' },
  label: { display: 'block', fontSize: '12px', color: 'rgba(232,244,240,0.5)', marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.06em' },
  input: { width: '100%', border: 'none', borderBottom: '2px solid rgba(255,255,255,0.12)', padding: '14px 0', fontSize: '16px', outline: 'none', transition: 'border-color 0.2s', background: 'transparent', color: '#E8F4F0' },
  btnPrimary: {
    width: '100%', padding: '16px 24px', marginTop: '8px',
    background: '#2ecc8a',
    color: '#fff', border: 'none', borderRadius: '8px',
    fontSize: '14px', fontWeight: 600, letterSpacing: '0.08em',
    cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px',
  },
  btnPrimaryArrow: { width: '18px', height: '18px', borderRight: '2px solid #fff', borderBottom: '2px solid #fff', transform: 'rotate(-45deg)', marginLeft: '4px' },
  error: { color: '#f87171', fontSize: '14px', marginBottom: '16px' },
  hint: { fontSize: '12px', color: 'rgba(232,244,240,0.35)', marginTop: '6px' },
  successBox: {
    background: 'rgba(52,211,153,0.08)', border: '1px solid rgba(52,211,153,0.25)',
    borderRadius: '10px', padding: '16px 20px', marginBottom: '24px',
    color: '#34d399', fontSize: '14px', lineHeight: 1.6,
  },
  invalidBox: {
    background: 'rgba(248,113,113,0.06)', border: '1px solid rgba(248,113,113,0.2)',
    borderRadius: '10px', padding: '16px 20px', marginBottom: '24px',
    color: '#f87171', fontSize: '14px', lineHeight: 1.6,
  },
  linkBlock: { textAlign: 'center', marginTop: '28px' },
  link: { color: '#2ecc8a', fontWeight: 600, textDecoration: 'none' },
};

export default function ResetPassword() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const token = searchParams.get('token') || '';

  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);
  const [loading, setLoading] = useState(false);

  // No token in URL — show a clear message instead of a broken form
  if (!token) {
    return (
      <div style={styles.layout}>
        <div style={styles.leftPanel}>
          <div style={styles.shapes}>
            <div style={styles.shape1} /><div style={styles.shape2} /><div style={styles.shape3} />
          </div>
          <div style={styles.logo}>
            <div style={styles.logoIcon}><div style={styles.logoIconInner} /></div>
            <span style={styles.logoText}>FLOWFUND</span>
          </div>
          <div style={styles.centerBlock}>
            <h1 style={styles.welcomeTitle}>Reset your password</h1>
            <p style={styles.welcomeSub}>Choose a new secure password</p>
          </div>
          <span style={styles.siteUrl}>flowfund.ai</span>
        </div>
        <div style={styles.rightPanel}>
          <h2 style={styles.formTitle}>Invalid link</h2>
          <div style={styles.invalidBox}>
            This reset link is missing or malformed. Please request a new one.
          </div>
          <div style={styles.linkBlock}>
            <Link to="/forgot-password" style={styles.link}>Request a new link</Link>
          </div>
        </div>
      </div>
    );
  }

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    if (password.length < 8) {
      setError('Password must be at least 8 characters.');
      return;
    }
    if (password !== confirm) {
      setError('Passwords do not match.');
      return;
    }

    setLoading(true);
    try {
      await resetPassword({ token, password });
      setDone(true);
      setTimeout(() => navigate('/login'), 3000);
    } catch (err) {
      setError(err.response?.data?.error || 'Reset failed. The link may have expired.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={styles.layout}>
      <div style={styles.leftPanel}>
        <div style={styles.shapes}>
          <div style={styles.shape1} /><div style={styles.shape2} /><div style={styles.shape3} />
        </div>
        <div style={styles.logo}>
          <div style={styles.logoIcon}><div style={styles.logoIconInner} /></div>
          <span style={styles.logoText}>FLOWFUND</span>
        </div>
        <div style={styles.centerBlock}>
          <h1 style={styles.welcomeTitle}>Reset your password</h1>
          <p style={styles.welcomeSub}>Choose a new secure password</p>
        </div>
        <span style={styles.siteUrl}>flowfund.ai</span>
      </div>

      <div style={styles.rightPanel}>
        <h2 style={styles.formTitle}>Set new password</h2>
        <p style={styles.subtitle}>
          Your reset link is valid for 30 minutes. Enter and confirm your new password below.
        </p>

        {done ? (
          <>
            <div style={styles.successBox}>
              Password updated successfully. Redirecting you to sign in…
            </div>
            <div style={styles.linkBlock}>
              <Link to="/login" style={styles.link}>Go to sign in</Link>
            </div>
          </>
        ) : (
          <form onSubmit={handleSubmit}>
            {error && <p style={styles.error}>{error}</p>}
            <div style={styles.inputWrap}>
              <label style={styles.label}>New password</label>
              <input
                type="password"
                style={styles.input}
                placeholder="At least 8 characters"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
              <p style={styles.hint}>Minimum 8 characters</p>
            </div>
            <div style={styles.inputWrap}>
              <label style={styles.label}>Confirm password</label>
              <input
                type="password"
                style={styles.input}
                placeholder="Repeat your new password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                required
              />
            </div>
            <button type="submit" style={styles.btnPrimary} disabled={loading}>
              {loading ? 'Saving...' : 'SET NEW PASSWORD'}
              {!loading && <span style={styles.btnPrimaryArrow} />}
            </button>
            <div style={styles.linkBlock}>
              <Link to="/login" style={{ ...styles.link, fontWeight: 400, color: 'rgba(232,244,240,0.45)' }}>
                Back to sign in
              </Link>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
