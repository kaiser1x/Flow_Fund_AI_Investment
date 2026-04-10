import axios from 'axios';

const apiUrl = import.meta.env.VITE_API_URL;

const notifApi = axios.create({
  baseURL: `${apiUrl || ''}/api/notifications`,
  headers: { 'Content-Type': 'application/json' },
});

notifApi.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

notifApi.interceptors.response.use(
  (res) => res,
  (err) => {
    if (err.response?.status === 401) {
      localStorage.removeItem('token');
      window.location.href = '/login';
    }
    return Promise.reject(err);
  }
);

export const getNotifications       = ()  => notifApi.get('/');
export const markNotificationRead   = (id) => notifApi.patch(`/${id}/read`);
export const markAllNotificationsRead = () => notifApi.patch('/read-all');
