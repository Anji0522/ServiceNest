import axios from 'axios';
import { clearAuthSession, readAuthSession, saveAuthSession } from './auth-session';

const API_ROOT = import.meta.env.VITE_API_URL
  ? `${import.meta.env.VITE_API_URL.replace(/\/+$/, '')}/api`
  : '/api';

export const hasSession = () => Boolean(readAuthSession()?.token);

const client = axios.create({ baseURL: API_ROOT, timeout: 20_000 });

client.interceptors.request.use((config) => {
  const token = readAuthSession()?.token;
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});


client.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      clearAuthSession();
      window.dispatchEvent(new Event('servicenest:auth-expired'));
    }
    if (!error.response && error.code !== 'ERR_CANCELED') {
      error.message = 'Cannot connect to the ServiceNest account service. Please try again later.';
    }
    return Promise.reject(error);
  },
);

const request = async (path, options = {}) => {
  try {
    const response = await client.request({ url: path, ...options });
    return response.data;
  } catch (error) {
    throw new Error(
      error.response?.data?.error
        || error.response?.data?.message
        || error.message
        || 'The request could not be completed.',
      { cause: error },
    );
  }
};

const authenticate = async (path, details) => {
  const result = await request(path, { method: 'POST', data: details });
  saveAuthSession(result.token, result.user);
  return result.user;
};

export const api = {
  checkAccountService: () => request('/health').then(({ status }) => status === 'ok'),
  getServices: () => request('/services'),
  register: (details) => authenticate('/auth/register', details),
  login: (details) => authenticate('/auth/login', details),
  getCurrentUser: () => request('/auth/me').then(({ user }) => user),
  logout: async () => {
    try {
      await request('/auth/logout', { method: 'POST' });
    } finally {
      clearAuthSession();
    }
  },
  getBookings: () => request('/bookings').then(({ bookings }) => bookings),
  getMyBookingHistory: () => request('/bookings/my-history').then(({ bookings }) => bookings),
  getBookingMessages: (bookingId) => request(`/bookings/${encodeURIComponent(bookingId)}/messages`).then(({ messages }) => messages),
  sendBookingMessage: (bookingId, body) => request(`/bookings/${encodeURIComponent(bookingId)}/messages`, {
    method: 'POST',
    data: { body },
  }).then(({ message }) => message),
  getProviderBookings: () => request('/provider/bookings').then(({ bookings }) => bookings),
  getProviderProfile: () => request('/provider/profile').then(({ profile }) => profile),
  createBooking: (details, idempotencyKey) => request('/bookings', {
    method: 'POST',
    data: details,
    headers: { 'Idempotency-Key': idempotencyKey },
  }).then(({ booking }) => booking),
  createBookingOrder: (details, idempotencyKey) => request('/bookings', {
    method: 'POST',
    data: { ...details, paymentMethod: 'razorpay' },
    headers: { 'Idempotency-Key': idempotencyKey },
  }),
  verifyPayment: (details) => request('/payments/verify', {
    method: 'POST',
    data: details,
  }),
  getProviderServices: () => request('/provider/services').then(({ services }) => services),
  createProviderService: (details) => request('/provider/services', {
    method: 'POST',
    data: details,
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
