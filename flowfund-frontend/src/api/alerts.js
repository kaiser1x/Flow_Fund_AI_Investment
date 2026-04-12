import axios from 'axios';

const apiUrl = import.meta.env.VITE_API_URL;

const alertsApi = axios.create({
  baseURL: `${apiUrl || ''}/api/alerts`,
  headers: { 'Content-Type': 'application/json' },
});

alertsApi.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

alertsApi.interceptors.response.use(
  (res) => res,
  (err) => {
    if (err.response?.status === 401) {
      localStorage.removeItem('token');
      window.location.href = '/login';
    }
    return Promise.reject(err);
  }
);

export const getAlertPreferences = () => alertsApi.get('/preferences');
export const updateAlertPreferences = (body) => alertsApi.put('/preferences', body);
export const getAnomalyEvents = (limit = 40) => alertsApi.get('/anomalies', { params: { limit } });
