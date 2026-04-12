import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { getProfile, updateProfile, logout as logoutApi } from '../api/auth';
import AppHeader from '../components/AppHeader';
import { C } from '../theme/flowfundTheme';

// ── Demo fallback profile ─────────────────────────────────────────────────────
const DEMO_PROFILE = {
  user_id: 0,
  first_name: 'Alex',
  last_name: 'Demo',
  email: 'alex.demo@flowfund.ai',
  phone: '555-0100',
  date_of_birth: '1998-06-15',
  role_name: 'user',
  created_at: new Date(Date.now() - 30 * 86400000).toISOString(),
};

// ── Helpers ───────────────────────────────────────────────────────────────────
function fmtDate(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
}

function Field({ label, value }) {
  return (
    <div style={{
      display: 'flex', justifyContent: 'space-between', alignItems: 'center',
      padding: '13px 0', borderBottom: `1px solid ${C.border}`,
    }}>
      <span style={{ fontSize: '11px', fontWeight: 700, color: C.faint, textTransform: 'uppercase', letterSpacing: '0.07em' }}>
        {label}
      </span>
      <span style={{ fontSize: '14px', color: C.ink, fontWeight: 500, maxWidth: '60%', textAlign: 'right', wordBreak: 'break-word' }}>
        {value || '—'}
      </span>
    </div>
  );
}

function InputField({ label, name, value, onChange, type = 'text', error, disabled }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
      <label style={{ fontSize: '11px', fontWeight: 700, color: C.faint, textTransform: 'uppercase', letterSpacing: '0.07em' }}>
        {label}
      </label>
      <input
        type={type}
        name={name}
        value={value}
        onChange={onChange}
        disabled={disabled}
        style={{
          padding: '9px 12px',
          border: `1.5px solid ${error ? C.danger : C.border}`,
          borderRadius: C.rs,
          fontSize: '14px',
          color: C.ink,
          background: disabled ? '#f8faf9' : C.surface,
          outline: 'none',
          width: '100%',
          boxSizing: 'border-box',
        }}
        onFocus={e => { if (!disabled) e.target.style.borderColor = C.brand; }}
        onBlur={e => { e.target.style.borderColor = error ? C.danger : C.border; }}
      />
      {error && <span style={{ fontSize: '11px', color: C.danger }}>{error}</span>}
    </div>
  );
}

// ── ProfilePage ───────────────────────────────────────────────────────────────
export default function ProfilePage() {
  const navigate = useNavigate();
  const [profile, setProfile]   = useState(null);
  const [loading, setLoading]   = useState(true);
  const [isDemo, setIsDemo]     = useState(false);
  const [editing, setEditing]   = useState(false);
  const [saving, setSaving]     = useState(false);
  const [success, setSuccess]   = useState('');
  const [apiError, setApiError] = useState('');

  // Form state (only editable fields)
  const [form, setForm] = useState({ first_name: '', last_name: '', email: '', phone: '', date_of_birth: '' });
  const [errors, setErrors] = useState({});

  useEffect(() => {
    getProfile()
      .then(({ data }) => {
        setProfile(data);
        syncForm(data);
      })
      .catch(() => {
        setProfile(DEMO_PROFILE);
        syncForm(DEMO_PROFILE);
        setIsDemo(true);
      })
      .finally(() => setLoading(false));
  }, []);

  function syncForm(p) {
    setForm({
      first_name:   p.first_name   || '',
      last_name:    p.last_name    || '',
      email:        p.email        || '',
      phone:        p.phone        || '',
      date_of_birth: p.date_of_birth ? p.date_of_birth.slice(0, 10) : '',
    });
  }

  function handleChange(e) {
    const { name, value } = e.target;
    setForm(f => ({ ...f, [name]: value }));
    setErrors(er => ({ ...er, [name]: '' }));
    setSuccess('');
    setApiError('');
  }

  function validate() {
    const errs = {};
    if (!form.first_name.trim())
      errs.first_name = 'First name is required';
    if (!form.email.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim()))
      errs.email = 'A valid email address is required';
    if (form.phone.trim() && !/^[\d\s\+\-\(\)\.]{7,20}$/.test(form.phone.trim()))
      errs.phone = 'Phone number format is invalid';
    return errs;
  }

  function handleCancel() {
    syncForm(profile);
    setErrors({});
    setSuccess('');
    setApiError('');
    setEditing(false);
  }

  async function handleSave(e) {
    e.preventDefault();
    const errs = validate();
    if (Object.keys(errs).length > 0) { setErrors(errs); return; }

    if (isDemo) {
      // Demo mode: simulate success without hitting API
      setProfile(p => ({ ...p, ...form }));
      setSuccess('Profile updated (demo mode — changes are not persisted).');
      setEditing(false);
      return;
    }

    setSaving(true);
    setApiError('');
    try {
      const { data } = await updateProfile(form);
      setProfile(data);
      syncForm(data);
      setSuccess('Profile updated successfully.');
      setEditing(false);
    } catch (err) {
      setApiError(err.response?.data?.error || 'Failed to save changes. Please try again.');
    } finally {
      setSaving(false);
    }
  }

  const handleLogout = async () => {
    try { await logoutApi(); } catch (_) {}
    localStorage.removeItem('token');
    navigate('/login');
  };

  const initials = [profile?.first_name, profile?.last_name]
    .filter(Boolean).map(n => n[0]?.toUpperCase()).join('') || 'FF';
  const fullName = [profile?.first_name, profile?.last_name].filter(Boolean).join(' ') || 'User';

  return (
    <div style={{ minHeight: '100vh', background: C.bg, fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif' }}>
      <AppHeader profile={profile} onLogout={handleLogout} liveData={!isDemo} isDemo={isDemo} />

      <div style={{ maxWidth: '680px', margin: '0 auto', padding: '40px 24px 64px' }}>

        {/* Back link */}
        <button
          onClick={() => navigate('/dashboard')}
          style={{
            background: 'transparent', border: 'none', cursor: 'pointer',
            display: 'flex', alignItems: 'center', gap: '6px',
            fontSize: '13px', fontWeight: 600, color: C.muted,
            padding: '0', marginBottom: '28px',
          }}
          onMouseEnter={e => { e.currentTarget.style.color = C.brand; }}
          onMouseLeave={e => { e.currentTarget.style.color = C.muted; }}
        >
          ← Back to Dashboard
        </button>

        {/* Page title */}
        <h1 style={{ fontSize: '26px', fontWeight: 800, color: C.ink, margin: '0 0 12px', letterSpacing: '-0.025em' }}>
          My Profile
        </h1>
        <button
          type="button"
          onClick={() => navigate('/settings/alerts')}
          style={{
            display: 'inline-flex', alignItems: 'center', gap: '6px',
            marginBottom: '24px', padding: 0, background: 'none', border: 'none',
            fontSize: '13px', fontWeight: 600, color: C.brand, cursor: 'pointer',
          }}
        >
          Alerts & notification settings →
        </button>

        {loading ? (
          // Shimmer skeleton
          <div style={{ background: C.surface, borderRadius: C.r, border: `1px solid ${C.border}`, padding: '28px 28px' }}>
            {[100, 70, 85, 60].map((w, i) => (
              <div key={i} style={{
                height: 18, borderRadius: '6px', marginBottom: '16px', width: `${w}%`,
                background: 'linear-gradient(90deg, #e8ede9 0%, #d4ddd8 50%, #e8ede9 100%)',
                backgroundSize: '400px 100%',
                animation: 'ff-shimmer 1.4s ease infinite',
              }} />
            ))}
          </div>
        ) : (
          <div style={{ background: C.surface, borderRadius: C.r, border: `1px solid ${C.border}`, boxShadow: C.shadow, overflow: 'hidden' }}>
            {/* Accent bar */}
            <div style={{ height: '4px', background: `linear-gradient(90deg, ${C.brand} 0%, ${C.accent} 100%)` }} />

            <div style={{ padding: '28px 28px' }}>
              {/* Avatar + name row */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '16px', marginBottom: '28px' }}>
                <div style={{
                  width: 56, height: 56, borderRadius: '16px', flexShrink: 0,
                  background: `linear-gradient(135deg, ${C.brand} 0%, ${C.accent} 100%)`,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: '20px', fontWeight: 800, color: '#fff',
                }}>
                  {initials}
                </div>
                <div>
                  <div style={{ fontSize: '18px', fontWeight: 700, color: C.ink }}>{fullName}</div>
                  <span style={{
                    display: 'inline-block', marginTop: '4px',
                    padding: '2px 10px', borderRadius: '20px',
                    background: C.accentFade, border: '1px solid rgba(46,204,138,0.22)',
                    fontSize: '11px', fontWeight: 600, color: C.brand,
                  }}>
                    {profile?.role_name || 'Member'}
                  </span>
                  {isDemo && (
                    <span style={{
                      display: 'inline-block', marginTop: '4px', marginLeft: '6px',
                      padding: '2px 9px', borderRadius: '20px',
                      background: 'rgba(217,119,6,0.09)', border: '1px solid rgba(217,119,6,0.25)',
                      fontSize: '10px', fontWeight: 700, color: C.warning,
                    }}>
                      DEMO
                    </span>
                  )}
                </div>
              </div>

              {/* Feedback banners */}
              {success && (
                <div style={{
                  padding: '10px 14px', borderRadius: C.rs, marginBottom: '16px',
                  background: 'rgba(22,163,74,0.07)', border: '1px solid rgba(22,163,74,0.2)',
                  fontSize: '13px', color: C.success, fontWeight: 500,
                }}>
                  ✓ {success}
                </div>
              )}
              {apiError && (
                <div style={{
                  padding: '10px 14px', borderRadius: C.rs, marginBottom: '16px',
                  background: 'rgba(220,38,38,0.06)', border: '1px solid rgba(220,38,38,0.18)',
                  fontSize: '13px', color: C.danger,
                }}>
                  {apiError}
                </div>
              )}

              {editing ? (
                // ── Edit mode ────────────────────────────────────────────────
                <form onSubmit={handleSave} noValidate style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
                    <InputField label="First Name *" name="first_name" value={form.first_name} onChange={handleChange} error={errors.first_name} disabled={saving} />
                    <InputField label="Last Name"    name="last_name"  value={form.last_name}  onChange={handleChange} disabled={saving} />
                  </div>
                  <InputField label="Email Address *" name="email" type="email" value={form.email} onChange={handleChange} error={errors.email} disabled={saving} />
                  <InputField label="Phone Number"    name="phone" type="tel"   value={form.phone} onChange={handleChange} error={errors.phone} disabled={saving} />
                  <InputField label="Date of Birth"   name="date_of_birth" type="date" value={form.date_of_birth} onChange={handleChange} disabled={saving} />

                  {/* Read-only fields in edit mode */}
                  <div style={{ padding: '12px 14px', borderRadius: C.rs, background: '#f8faf9', border: `1px solid ${C.border}` }}>
                    <div style={{ fontSize: '11px', fontWeight: 700, color: C.faint, textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: '4px' }}>Account Type</div>
                    <div style={{ fontSize: '14px', color: C.ink }}>{profile?.role_name || 'Member'} <span style={{ color: C.faint, fontSize: '12px' }}>(not editable)</span></div>
                  </div>

                  <div style={{ display: 'flex', gap: '10px', marginTop: '4px' }}>
                    <button
                      type="submit"
                      disabled={saving}
                      style={{
                        flex: 1, padding: '10px 0',
                        background: saving ? '#dde4e1' : C.brand,
                        color: saving ? C.faint : '#fff',
                        border: 'none', borderRadius: C.rs,
                        fontSize: '14px', fontWeight: 600, cursor: saving ? 'not-allowed' : 'pointer',
                      }}
                      onMouseEnter={e => { if (!saving) e.currentTarget.style.background = C.brand2; }}
                      onMouseLeave={e => { if (!saving) e.currentTarget.style.background = C.brand; }}
                    >
                      {saving ? 'Saving…' : 'Save Changes'}
                    </button>
                    <button
                      type="button"
                      onClick={handleCancel}
                      disabled={saving}
                      style={{
                        flex: 1, padding: '10px 0',
                        background: 'transparent',
                        border: `1.5px solid ${C.border}`,
                        borderRadius: C.rs,
                        fontSize: '14px', fontWeight: 600,
                        color: C.muted, cursor: saving ? 'not-allowed' : 'pointer',
                      }}
                      onMouseEnter={e => { if (!saving) { e.currentTarget.style.borderColor = C.brand; e.currentTarget.style.color = C.brand; } }}
                      onMouseLeave={e => { e.currentTarget.style.borderColor = C.border; e.currentTarget.style.color = C.muted; }}
                    >
                      Cancel
                    </button>
                  </div>
                </form>
              ) : (
                // ── Read-only view ───────────────────────────────────────────
                <>
                  <Field label="First Name"    value={profile?.first_name} />
                  <Field label="Last Name"     value={profile?.last_name} />
                  <Field label="Email"         value={profile?.email} />
                  <Field label="Phone"         value={profile?.phone} />
                  <Field label="Date of Birth" value={fmtDate(profile?.date_of_birth)} />
                  <Field label="Account Type"  value={profile?.role_name || 'Member'} />
                  <Field label="Member Since"  value={fmtDate(profile?.created_at)} />

                  <button
                    onClick={() => { setSuccess(''); setApiError(''); setEditing(true); }}
                    style={{
                      marginTop: '20px', width: '100%', padding: '10px 0',
                      background: C.brand, color: '#fff',
                      border: 'none', borderRadius: C.rs,
                      fontSize: '14px', fontWeight: 600, cursor: 'pointer',
                    }}
                    onMouseEnter={e => { e.currentTarget.style.background = C.brand2; }}
                    onMouseLeave={e => { e.currentTarget.style.background = C.brand; }}
                  >
                    Edit Profile
                  </button>
                </>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
