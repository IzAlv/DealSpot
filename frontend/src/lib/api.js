import axios from 'axios';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL || '';

const api = axios.create({
  baseURL: BACKEND_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Add auth token to requests
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('ba_token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Handle 401 responses (skip for login endpoint and non-auth errors)
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401 && !error.config?.url?.includes('/auth/login')) {
      // Only logout if token actually exists (avoid logout loop)
      const token = localStorage.getItem('ba_token');
      if (token) {
        localStorage.removeItem('ba_token');
        localStorage.removeItem('ba_user');
        window.location.href = '/login';
      }
    }
    return Promise.reject(error);
  }
);

export default api;
