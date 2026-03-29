import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { getProfile, logout as logoutApi } from '../api/auth';
import { getAccounts } from '../api/plaid';
import usePlaidLink from '../hooks/usePlaidLink';

const styles = {
  page: {
    minHeight: '100vh',
    background: 'linear-gradient(180deg, #f8faf9 0%, #fff 100%)',
    padding: '32px 48px',
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '48px',
    paddingBottom: '24px',
    borderBottom: '1px solid #e8ecea',
  },
  logo: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
  },
  logoIcon: {
    width: '32px',
    height: '32px',
    border: '2px solid #1a4d3e',
    borderRadius: '50%',
    position: 'relative',
  },
  logoIconInner: {
    position: 'absolute',
    width: '16px',
    height: '16px',
    border: '2px solid #1a4d3e',
    borderRadius: '50%',
    top: '50%',
    left: '50%',
    transform: 'translate(-50%, -50%)',
  },
  logoText: {
    color: '#0f2d25',
    fontSize: '18px',
    fontWeight: 700,
    letterSpacing: '0.05em',
  },
  btnLogout: {
    padding: '10px 20px',
    background: '#fff',
    color: '#1a4d3e',
    border: '2px solid #1a4d3e',
    borderRadius: '8px',
    fontSize: '14px',
    fontWeight: 600,
    cursor: 'pointer',
  },
  card: {
    maxWidth: '520px',
    background: '#fff',
    borderRadius: '12px',
    boxShadow: '0 4px 20px rgba(15, 45, 37, 0.08)',
    padding: '40px',
    border: '1px solid #e8ecea',
  },
  cardTitle: {
    fontSize: '22px',
    fontWeight: 700,
    color: '#0f2d25',
    marginBottom: '24px',
  },
  row: {
    marginBottom: '16px',
    paddingBottom: '16px',
    borderBottom: '1px solid #f0f0f0',
  },
  rowLast: {
    marginBottom: 0,
    paddingBottom: 0,
    borderBottom: 'none',
  },
  label: {
    fontSize: '12px',
    color: '#666',
    textTransform: 'uppercase',
    letterSpacing: '0.06em',
    marginBottom: '4px',
  },
  value: {
    fontSize: '16px',
    color: '#0f2d25',
    fontWeight: 500,
  },
  roleBadge: {
    display: 'inline-block',
    padding: '4px 12px',
    borderRadius: '20px',
    fontSize: '13px',
    fontWeight: 600,
    background: 'rgba(26, 77, 62, 0.12)',
    color: '#1a4d3e',
  },
  loading: {
    color: '#666',
    fontSize: '16px',
  },
  error: {
    color: '#c53030',
    fontSize: '14px',
  },
  success: {
    color: '#1a7f37',
    fontSize: '14px',
    marginBottom: '12px',
  },
  sectionTitle: {
    fontSize: '18px',
    fontWeight: 700,
    color: '#0f2d25',
    marginBottom: '16px',
    marginTop: '24px',
  },
  btnPrimary: {
    padding: '10px 16px',
    background: '#1a4d3e',
    color: '#fff',
    border: 'none',
    borderRadius: '8px',
    fontSize: '14px',
    fontWeight: 600,
    cursor: 'pointer',
    marginBottom: '16px',
  },
  btnSecondary: {
    padding: '8px 12px',
    background: '#fff',
    color: '#1a4d3e',
    border: '1px solid #1a4d3e',
    borderRadius: '8px',
    fontSize: '13px',
    cursor: 'pointer',
    marginBottom: '16px',
  },
  accountItem: {
    marginBottom: '12px',
    paddingBottom: '12px',
    borderBottom: '1px solid #f0f0f0',
  },
  accountName: {
    fontWeight: 600,
    color: '#0f2d25',
  },
  accountMeta: {
    fontSize: '13px',
    color: '#666',
  },
};

export default function Dashboard() {
  const navigate = useNavigate();
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [accounts, setAccounts] = useState([]);
  const [accountsLoading, setAccountsLoading] = useState(false);
  const [accountsError, setAccountsError] = useState('');

  const fetchAccounts = async () => {
    setAccountsLoading(true);
    setAccountsError('');
    try {
      const { data } = await getAccounts();
      setAccounts(data.accounts || []);
    } catch (err) {
      setAccountsError(err.response?.data?.error || 'Failed to load linked accounts');
    } finally {
      setAccountsLoading(false);
    }
  };

  const {
    openPlaid,
    ready,
    loadingToken,
    linking,
    error: plaidError,
    successMessage,
    retryLinkToken,
  } = usePlaidLink(fetchAccounts);

  useEffect(() => {
    getProfile()
      .then(({ data }) => setProfile(data))
      .catch((err) => setError(err.response?.data?.error || 'Failed to load profile'))
      .finally(() => setLoading(false));

    fetchAccounts();
  }, []);

  const handleLogout = async () => {
    try {
      await logoutApi();
    } catch (_) {}
    localStorage.removeItem('token');
    navigate('/login');
  };

  if (loading) {
    return (
      <div style={styles.page}>
        <div style={styles.header}>
          <div style={styles.logo}>
            <div style={styles.logoIcon}>
              <div style={styles.logoIconInner} />
            </div>
            <span style={styles.logoText}>FLOWFUND</span>
          </div>
        </div>
        <p style={styles.loading}>Loading profile...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div style={styles.page}>
        <div style={styles.header}>
          <div style={styles.logo}>
            <div style={styles.logoIcon}>
              <div style={styles.logoIconInner} />
            </div>
            <span style={styles.logoText}>FLOWFUND</span>
          </div>
          <button style={styles.btnLogout} onClick={handleLogout}>Log out</button>
        </div>
        <p style={styles.error}>{error}</p>
      </div>
    );
  }

  if (!profile) {
    return (
      <div style={styles.page}>
        <div style={styles.header}>
          <div style={styles.logo}>
            <div style={styles.logoIcon}>
              <div style={styles.logoIconInner} />
            </div>
            <span style={styles.logoText}>FLOWFUND</span>
          </div>
          <button style={styles.btnLogout} onClick={handleLogout}>Log out</button>
        </div>
        <p style={styles.error}>Profile data is unavailable. Please log in again.</p>
      </div>
    );
  }

  const fullName = [profile.first_name, profile.last_name].filter(Boolean).join(' ') || 'User';

  return (
    <div style={styles.page}>
      <div style={styles.header}>
        <div style={styles.logo}>
          <div style={styles.logoIcon}>
            <div style={styles.logoIconInner} />
          </div>
          <span style={styles.logoText}>FLOWFUND</span>
        </div>
        <button style={styles.btnLogout} onClick={handleLogout}>Log out</button>
      </div>

      <div style={styles.card}>
        <h2 style={styles.cardTitle}>Profile</h2>
        <div style={styles.row}>
          <div style={styles.label}>Name</div>
          <div style={styles.value}>{fullName}</div>
        </div>
        <div style={styles.row}>
          <div style={styles.label}>Email</div>
          <div style={styles.value}>{profile.email}</div>
        </div>
        <div style={{ ...styles.row, ...styles.rowLast }}>
          <div style={styles.label}>Role</div>
          <div style={styles.value}>
            <span style={styles.roleBadge}>{profile.role_name}</span>
          </div>
        </div>

        <h3 style={styles.sectionTitle}>Linked Bank Accounts</h3>
        {successMessage && <p style={styles.success}>{successMessage}</p>}
        {plaidError && (
          <>
            <p style={styles.error}>{plaidError}</p>
            <button style={styles.btnSecondary} onClick={retryLinkToken}>
              Retry
            </button>
          </>
        )}

        <button
          style={styles.btnPrimary}
          onClick={openPlaid}
          disabled={loadingToken || linking || !ready}
        >
          {loadingToken ? 'Preparing Plaid...' : linking ? 'Linking...' : 'Connect Bank'}
        </button>

        {accountsError && <p style={styles.error}>{accountsError}</p>}
        {accountsLoading && <p style={styles.loading}>Loading linked accounts...</p>}
        {!accountsLoading && accounts.length === 0 && (
          <p style={styles.accountMeta}>No linked accounts yet.</p>
        )}
        {!accountsLoading &&
          accounts.map((account) => (
            <div key={account.plaid_account_id} style={styles.accountItem}>
              <div style={styles.accountName}>
                {account.institution_name || 'Bank'} - {account.name}
              </div>
              <div style={styles.accountMeta}>
                {account.type} {account.mask ? `- ****${account.mask}` : ''} - ${Number(account.balance || 0).toFixed(2)}
              </div>
            </div>
          ))}
      </div>
    </div>
  );
}
