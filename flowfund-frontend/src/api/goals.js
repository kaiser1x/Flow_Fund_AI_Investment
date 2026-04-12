import axios from 'axios';

const apiUrl = import.meta.env.VITE_API_URL;

const api = axios.create({
  baseURL: `${apiUrl || ''}/api/goals`,
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

export const getGoals         = (filter = 'all') => api.get('/', { params: { filter } });
export const getGoalsSummary  = ()               => api.get('/summary');
export const getGoalsInsights = ()               => api.get('/insights');
export const createGoal       = (data)           => api.post('/', data);
export const updateGoal       = (id, data)       => api.patch(`/${id}`, data);
export const deleteGoal       = (id)             => api.delete(`/${id}`);
