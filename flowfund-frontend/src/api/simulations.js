import axios from 'axios';

const apiUrl = import.meta.env.VITE_API_URL;

const api = axios.create({
  baseURL: `${apiUrl || ''}/api/simulations`,
  headers: { 'Content-Type': 'application/json' },
});

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

api.interceptors.response.use(
  (res) => res,
  (err) => {
    if (err.response?.status === 401) {
      localStorage.removeItem('token');
      window.location.href = '/login';
    }
    return Promise.reject(err);
  }
);

export const runSimulation       = (data)     => api.post('/run', data);
export const getPreFill          = ()         => api.get('/prefill');
export const getSnapshots        = ()         => api.get('/');
export const getSnapshotsSummary = ()         => api.get('/summary');
export const saveSnapshot        = (data)     => api.post('/save', data);
export const updateSnapshot      = (id, data) => api.patch(`/${id}`, data);
export const deleteSnapshot      = (id)       => api.delete(`/${id}`);
