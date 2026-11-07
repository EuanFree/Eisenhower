import axios from 'axios';

const api = axios.create({
  baseURL: '/api/v1',
  headers: {
    'Content-Type': 'application/json',
  },
  // Enforce HTTPS — reject unauthorized certificates in production
  httpsAgent: undefined,
});

// Attach JWT token from memory (set by auth flow)
let authToken: string | null = null;

export const setAuthToken = (token: string | null) => {
  authToken = token;
  if (token) {
    api.defaults.headers.common['Authorization'] = `Bearer ${token}`;
  } else {
    delete api.defaults.headers.common['Authorization'];
  }
};

export const getAuthToken = () => authToken;

// Request interceptor: normalize URL prefixes & attach token on every request
api.interceptors.request.use((config) => {
  if (config.url) {
    // Strip redundant /api/v1 prefix when baseURL is already '/api/v1'
    if (config.url.startsWith('/api/v1/')) {
      config.url = config.url.slice('/api/v1'.length);
    } else if (config.url === '/api/v1') {
      config.url = '/';
    } else if (config.url.startsWith('/api/')) {
      // Allow explicit /api/... endpoints (e.g. /api/auth, /api/users) to bypass /api/v1 baseURL
      config.baseURL = '';
    }
  }
  if (authToken) {
    config.headers.Authorization = `Bearer ${authToken}`;
  }
  return config;
});

// Response interceptor: unwrap data on success while preserving backwards-compatible .data access
api.interceptors.response.use(
  (response) => {
    const payload = response.data;
    if (
      payload &&
      typeof payload === 'object' &&
      !('data' in payload)
    ) {
      try {
        Object.defineProperty(payload, 'data', {
          get() {
            return payload;
          },
          enumerable: false,
          configurable: true,
        });
      } catch {
        // Ignore if object is frozen/non-extensible
      }
    }
    return payload;
  },
  (error) => {
    if (error.response?.status === 401) {
      // Token expired or invalid — clear token without forcing a full-page reload loop
      setAuthToken(null);
    }
    return Promise.reject(error);
  },
);

export default api;
