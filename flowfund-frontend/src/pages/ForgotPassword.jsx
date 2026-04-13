import { useState } from 'react';
import { Link } from 'react-router-dom';
import { forgotPassword } from '../api/auth';

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
  successBox: {
    background: 'rgba(52,211,153,0.08)', border: '1px solid rgba(52,211,153,0.25)',
    borderRadius: '10px', padding: '16px 20px', marginBottom: '24px',
    color: '#34d399', fontSize: '14px', lineHeight: 1.6,
  },
  linkBlock: { textAlign: 'center', marginTop: '28px' },
  link: { color: '#2ecc8a', fontWeight: 600, textDecoration: 'none' },
};

export default function ForgotPassword() {
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await forgotPassword({ email });
      setSubmitted(true);
    } catch {
      // Show neutral message even on network error — avoids UX confusion
      setSubmitted(true);
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
          <p style={styles.welcomeSub}>We'll send a secure link to your inbox</p>
        </div>
        <span style={styles.siteUrl}>flowfund.ai</span>
      </div>

      <div style={styles.rightPanel}>
        <h2 style={styles.formTitle}>Forgot password?</h2>
        <p style={styles.subtitle}>
          Enter the email address associated with your account and we'll send you a reset link.
        </p>

        {submitted ? (
          <>
            <div style={styles.successBox}>
              If an account exists for that email, a password reset link has been sent. Check your inbox (and spam folder).
            </div>
            <div style={styles.linkBlock}>
              <Link to="/login" style={styles.link}>Back to sign in</Link>
            </div>
          </>
        ) : (
          <form onSubmit={handleSubmit}>
            {error && <p style={styles.error}>{error}</p>}
            <div style={styles.inputWrap}>
              <label style={styles.label}>Email</label>
              <input
                type="email"
                style={styles.input}
                placeholder="Email address"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>
            <button type="submit" style={styles.btnPrimary} disabled={loading}>
              {loading ? 'Sending...' : 'SEND RESET LINK'}
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
