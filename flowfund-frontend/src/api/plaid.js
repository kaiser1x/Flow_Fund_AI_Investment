import axios from 'axios';

const apiUrl = import.meta.env.VITE_API_URL;
if (!apiUrl) {
  // Avoid crashing the entire SPA at module load time.
  console.error('VITE_API_URL is not defined. Plaid API requests will fail until it is set.');
}
const API_BASE = `${apiUrl || ''}/api/plaid`;

const plaidApi = axios.create({
  baseURL: API_BASE,
  headers: { 'Content-Type': 'application/json' },
});

plaidApi.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (err) => Promise.reject(err)
);

plaidApi.interceptors.response.use(
  (res) => res,
  (err) => {
    if (err.response?.status === 401) {
      localStorage.removeItem('token');
      window.location.href = '/login';
    }
    return Promise.reject(err);
  }
);

export const createLinkToken = () => plaidApi.post('/create-link-token');
export const exchangePublicToken = (public_token) =>
  plaidApi.post('/exchange-public-token', { public_token });
export const getAccounts = () => plaidApi.get('/accounts');
/** Runs /transactions/sync for all linked items, then metrics + readiness. */
export const syncPlaidFromBank = () => plaidApi.post('/sync');
/** Sandbox / optional prod: /transactions/refresh then sync (simulates new activity). */
export const sandboxRefreshPlaidTransactions = () => plaidApi.post('/transactions-refresh');
/** Clears Plaid items + linked accounts + their transactions (use after encryption key change). */
export const disconnectPlaidLink = () => plaidApi.delete('/link');

export default plaidApi;
