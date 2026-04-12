import axios from 'axios';

const apiUrl = import.meta.env.VITE_API_URL;
const BASE = `${apiUrl || ''}/api/admin-sim`;

const STORAGE_PW = 'ff_admin_sim_password';

/** Must match server ADMIN_SIM_PASSWORD, or default flowfundai123$ */
export const ADMIN_SIM_UI_PASSWORD = (import.meta.env.VITE_ADMIN_SIM_PASSWORD || 'flowfundai123$').trim();

const client = axios.create({ baseURL: BASE, headers: { 'Content-Type': 'application/json' } });

function passwordHeader() {
  const pw =
    typeof sessionStorage !== 'undefined' ? (sessionStorage.getItem(STORAGE_PW) || '').trim() : '';
  return pw ? { 'X-Admin-Sim-Password': pw } : {};
}

client.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  Object.assign(config.headers, passwordHeader());
  return config;
});

client.interceptors.response.use(
  (r) => r,
  (err) => {
    if (err.response?.status === 401) {
      localStorage.removeItem('token');
      window.location.href = '/login';
    }
    return Promise.reject(err);
  }
);

export function saveAdminSimPassword(pw) {
  try {
    sessionStorage.setItem(STORAGE_PW, (pw || '').trim());
  } catch (_) {}
}

export function clearAdminSimPassword() {
  try {
    sessionStorage.removeItem(STORAGE_PW);
  } catch (_) {}
}

export function listTargetAccounts(userId) {
  return client.get(`/users/${userId}/accounts`);
}

export function listTargetTransactions(userId, limit = 50) {
  return client.get(`/users/${userId}/transactions`, { params: { limit } });
}

export function plaidSyncTargetUser(userId) {
  return client.post(`/users/${userId}/plaid-sync`);
}

export function plaidRefreshTargetUser(userId) {
  return client.post(`/users/${userId}/plaid-transactions-refresh`);
}

export function createDemoCustomerTransaction(userId, body) {
  return client.post(`/users/${userId}/transactions`, body);
}

export function updateDemoCustomerTransaction(txnId, body) {
  return client.patch(`/transactions/${txnId}`, body);
}

export function deleteDemoCustomerTransaction(txnId, userId) {
  return client.delete(`/transactions/${txnId}`, { params: { user_id: userId } });
}

export default client;
