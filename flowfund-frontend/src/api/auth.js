import axios from 'axios';

if (!import.meta.env.VITE_API_URL) {
  throw new Error('VITE_API_URL is not defined');
}

const API_BASE = `${import.meta.env.VITE_API_URL}/api/auth`;

const authApi = axios.create({
  baseURL: API_BASE,
  headers: { 'Content-Type': 'application/json' },
});

authApi.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (err) => Promise.reject(err)
);

authApi.interceptors.response.use(
  (res) => res,
  (err) => {
    if (err.response?.status === 401) {
      localStorage.removeItem('token');
      window.location.href = '/login';
    }
    return Promise.reject(err);
  }
);

export const register = (data) => authApi.post('/register', data);
export const login = (data) => authApi.post('/login', data);
export const logout = () => authApi.post('/logout');
export const getProfile = () => authApi.get('/profile');

export default authApi;
