const API_ROOT = import.meta.env.VITE_API_URL
  ? `${import.meta.env.VITE_API_URL.replace(/\/+$/, '')}/api`
  : '/api';
const TOKEN_KEY = 'servicenest_token';

export const hasSession = () => Boolean(localStorage.getItem(TOKEN_KEY));

const request = async (path, options = {}) => {
  const token = localStorage.getItem(TOKEN_KEY);
  const response = await fetch(`${API_ROOT}${path}`, {
    ...options,
    headers: {
      ...(options.body ? { 'Content-Type': 'application/json' } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options.headers,
    },
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error || 'The request could not be completed.');
  return payload;
};

const authenticate = async (path, details) => {
  const result = await request(path, { method: 'POST', body: JSON.stringify(details) });
  localStorage.setItem(TOKEN_KEY, result.token);
  return result.user;
};

export const api = {
  getServices: () => request('/services'),
  register: (details) => authenticate('/auth/register', details),
  login: (details) => authenticate('/auth/login', details),
  getCurrentUser: () => request('/auth/me').then(({ user }) => user),
  logout: async () => {
    try {
      await request('/auth/logout', { method: 'POST' });
    } finally {
      localStorage.removeItem(TOKEN_KEY);
    }
  },
  getBookings: () => request('/bookings').then(({ bookings }) => bookings),
  getBookingMessages: (bookingId) => request(`/bookings/${encodeURIComponent(bookingId)}/messages`).then(({ messages }) => messages),
  sendBookingMessage: (bookingId, body) => request(`/bookings/${encodeURIComponent(bookingId)}/messages`, {
    method: 'POST',
    body: JSON.stringify({ body }),
  }).then(({ message }) => message),
  getProviderBookings: () => request('/provider/bookings').then(({ bookings }) => bookings),
  getProviderProfile: () => request('/provider/profile').then(({ profile }) => profile),
  createBooking: (details) => request('/bookings', {
    method: 'POST',
    body: JSON.stringify(details),
  }).then(({ booking }) => booking),
  getProviderServices: () => request('/provider/services').then(({ services }) => services),
  createProviderService: (details) => request('/provider/services', {
    method: 'POST',
    body: JSON.stringify(details),
  }).then(({ service }) => service),
};

export const categories = [
  { id: 1, name: 'Electrician' },
  { id: 2, name: 'Plumber' },
  { id: 3, name: 'AC Repair' },
  { id: 4, name: 'Cleaning' },
  { id: 5, name: 'Carpentry' },
  { id: 6, name: 'Painting' },
];
