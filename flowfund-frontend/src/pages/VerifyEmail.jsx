import { useState, useEffect, useRef } from 'react';
import { useNavigate, useSearchParams, Link } from 'react-router-dom';
import { verifyOtp, resendOtp } from '../api/auth';

const styles = {
  layout: { display: 'flex', minHeight: '100vh', width: '100%' },
  leftPanel: {
    flex: '1', background: 'linear-gradient(135deg, #0f2d25 0%, #1a4d3e 40%, #0d3d2e 100%)',
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
    width: '480px', minHeight: '100vh', background: '#fff',
    display: 'flex', flexDirection: 'column', justifyContent: 'center',
    padding: '48px 56px', boxShadow: '-4px 0 24px rgba(0,0,0,0.06)',
  },
  formTitle: { fontSize: '28px', fontWeight: 700, color: '#0f2d25', marginBottom: '8px' },
  subtitle: { fontSize: '14px', color: '#6b7c77', marginBottom: '32px', lineHeight: 1.5 },
  emailBadge: {
    display: 'inline-block', padding: '4px 12px', borderRadius: '20px',
    background: 'rgba(26,77,62,0.08)', border: '1px solid rgba(26,77,62,0.18)',
    fontSize: '13px', fontWeight: 600, color: '#1a4d3e',
  },
  otpRow: { display: 'flex', gap: '10px', marginBottom: '28px', justifyContent: 'center' },
  otpBox: {
    width: '52px', height: '60px', textAlign: 'center',
    border: '2px solid #e8e8e8', borderRadius: '10px',
    fontSize: '24px', fontWeight: 700, color: '#0f2d25',
    outline: 'none', background: '#fff',
    transition: 'border-color 0.2s',
  },
  btnPrimary: {
    width: '100%', padding: '16px 24px', marginTop: '4px',
    background: 'linear-gradient(90deg, #1a4d3e 0%, #2d6a52 50%, #3d7a5c 100%)',
    color: '#fff', border: 'none', borderRadius: '8px',
    fontSize: '14px', fontWeight: 600, letterSpacing: '0.08em',
    cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px',
  },
  error: { color: '#c53030', fontSize: '14px', marginBottom: '16px' },
  success: { color: '#16a34a', fontSize: '14px', marginBottom: '16px', fontWeight: 500 },
  resendRow: { textAlign: 'center', marginTop: '20px', fontSize: '13px', color: '#6b7c77' },
  resendBtn: {
    background: 'none', border: 'none', cursor: 'pointer',
    color: '#1a4d3e', fontWeight: 600, fontSize: '13px', padding: 0,
  },
  link: { color: '#1a4d3e', fontWeight: 600, textDecoration: 'none' },
};

export default function VerifyEmail() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const email = searchParams.get('email') || '';

  const [digits, setDigits] = useState(['', '', '', '', '', '']);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [loading, setLoading] = useState(false);
  const [countdown, setCountdown] = useState(0);
  const inputRefs = useRef([]);

  // Countdown for resend throttle
  useEffect(() => {
    if (countdown <= 0) return;
    const t = setTimeout(() => setCountdown(c => c - 1), 1000);
    return () => clearTimeout(t);
  }, [countdown]);

  const handleDigitChange = (i, val) => {
    const v = val.replace(/\D/g, '').slice(-1);
    const next = [...digits];
    next[i] = v;
    setDigits(next);
    if (v && i < 5) inputRefs.current[i + 1]?.focus();
  };

  const handleKeyDown = (i, e) => {
    if (e.key === 'Backspace' && !digits[i] && i > 0) {
      inputRefs.current[i - 1]?.focus();
    }
  };

  const handlePaste = (e) => {
    const pasted = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6);
    if (pasted.length === 6) {
      setDigits(pasted.split(''));
      inputRefs.current[5]?.focus();
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const otp = digits.join('');
    if (otp.length < 6) { setError('Enter all 6 digits'); return; }
    setError(''); setLoading(true);
    try {
      await verifyOtp({ email, otp });
      setSuccess('Email verified! Redirecting to login…');
      setTimeout(() => navigate('/login'), 1500);
    } catch (err) {
      setError(err.response?.data?.error || 'Verification failed. Try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleResend = async () => {
    setError(''); setSuccess('');
    try {
      await resendOtp({ email });
      setSuccess('New code sent — check your email.');
      setCountdown(60);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to resend. Try again.');
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
          <h1 style={styles.welcomeTitle}>Check your inbox</h1>
          <p style={styles.welcomeSub}>A 6-digit code was sent to verify your account</p>
        </div>
        <span style={styles.siteUrl}>flowfund.ai</span>
      </div>

      <div style={styles.rightPanel}>
        <h2 style={styles.formTitle}>Verify your email</h2>
        <p style={styles.subtitle}>
          We sent a code to<br />
          <span style={styles.emailBadge}>{email || 'your email'}</span>
        </p>

        <form onSubmit={handleSubmit}>
          {error && <p style={styles.error}>{error}</p>}
          {success && <p style={styles.success}>{success}</p>}

          <div style={styles.otpRow} onPaste={handlePaste}>
            {digits.map((d, i) => (
              <input
                key={i}
                ref={el => inputRefs.current[i] = el}
                type="text"
                inputMode="numeric"
                maxLength={1}
                value={d}
                style={{
                  ...styles.otpBox,
                  borderColor: d ? '#1a4d3e' : '#e8e8e8',
                }}
                onChange={e => handleDigitChange(i, e.target.value)}
                onKeyDown={e => handleKeyDown(i, e)}
                onFocus={e => { e.target.style.borderColor = '#1a4d3e'; }}
                onBlur={e => { e.target.style.borderColor = d ? '#1a4d3e' : '#e8e8e8'; }}
              />
            ))}
          </div>

          <button type="submit" style={styles.btnPrimary} disabled={loading}>
            {loading ? 'Verifying…' : 'VERIFY EMAIL'}
          </button>
        </form>

        <div style={styles.resendRow}>
          {countdown > 0 ? (
            <span>Resend in {countdown}s</span>
          ) : (
            <>
              Didn't get it?{' '}
              <button style={styles.resendBtn} onClick={handleResend} type="button">
                Resend code
              </button>
            </>
          )}
        </div>

        <div style={{ textAlign: 'center', marginTop: '24px', fontSize: '13px', color: '#6b7c77' }}>
          Wrong email?{' '}
          <Link to="/register" style={styles.link}>Start over</Link>
        </div>
      </div>
    </div>
  );
}
