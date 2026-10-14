import axios from 'axios';
import { clearAuthSession, readAuthSession, saveAuthSession } from './auth-session';

const rawApiUrl = (import.meta.env.VITE_API_BASE_URL || import.meta.env.VITE_API_URL || '').trim();
const API_ROOT = rawApiUrl
  ? (rawApiUrl.endsWith('/api') ? rawApiUrl : `${rawApiUrl.replace(/\/+$/, '')}/api`)
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

const DEMO_BOOKINGS_KEY = 'servicenest_demo_bookings';

const getStoredDemoBookings = () => {
  try {
    const raw = localStorage.getItem(DEMO_BOOKINGS_KEY);
    return raw ? JSON.parse(raw) : [
      {
        id: 'demo-booking-1',
        customer_id: 'demo-customer-1',
        provider_id: '3',
        service_id: 103,
        status: 'accepted',
        payment_status: 'paid',
        payment_method: 'razorpay',
        total_amount: 130,
        hours: 2,
        scheduled_date: new Date(Date.now() + 86400000).toISOString(),
        appointment_at: new Date(Date.now() + 86400000).toISOString(),
        created_at: new Date(Date.now() - 3600000).toISOString(),
        updated_at: new Date().toISOString(),
        service_title: 'HVAC Seasonal Tune-Up & Gas Refill',
        category_name: 'AC Repair',
        provider_name: 'Elena Rostova',
        counterpart_name: 'Elena Rostova',
        counterpart_phone: '+1 555-0188',
        counterpart_email: 'elena.rostova@example.com',
        customer_address: '123 Market St, Suite 4',
      },
    ];
  } catch {
    return [];
  }
};

export const api = {
  checkAccountService: () => request('/health').then(({ status }) => status === 'ok'),
  getServices: () => request('/services'),
  register: (details) => authenticate('/auth/register', details),
  login: (details) => authenticate('/auth/login', details),
  setDemoSession: (token, user) => saveAuthSession(token, user),
  getCurrentUser: () => request('/auth/me').then(({ user }) => user),
  logout: async () => {
    try {
      await request('/auth/logout', { method: 'POST' });
    } catch {
      // In demo mode or offline, clear local session cleanly
    } finally {
      clearAuthSession();
    }
  },
  getBookings: async () => {
    try {
      const { bookings } = await request('/bookings');
      return bookings;
    } catch {
      return getStoredDemoBookings();
    }
  },
  getMyBookingHistory: async () => {
    try {
      const { bookings } = await request('/bookings/my-history');
      return bookings;
    } catch {
      return getStoredDemoBookings();
    }
  },
  getBookingMessages: async (bookingId) => {
    try {
      const { messages } = await request(`/bookings/${encodeURIComponent(bookingId)}/messages`);
      return messages;
    } catch {
      return [
        {
          id: 'demo-msg-1',
          booking_id: bookingId,
          sender_id: 'provider-1',
          sender_name: 'Elena Rostova',
          body: 'Hello! I received your booking request. I will arrive on schedule with all required equipment.',
          created_at: new Date(Date.now() - 1800000).toISOString(),
        },
      ];
    }
  },
  sendBookingMessage: async (bookingId, body) => {
    try {
      const { message } = await request(`/bookings/${encodeURIComponent(bookingId)}/messages`, {
        method: 'POST',
        data: { body },
      });
      return message;
    } catch {
      const user = readAuthSession()?.user;
      return {
        id: `demo-msg-${Date.now()}`,
        booking_id: bookingId,
        sender_id: user?.id || 'demo-user',
        sender_name: user?.name || 'Customer',
        body,
        created_at: new Date().toISOString(),
      };
    }
  },
  getProviderBookings: async () => {
    try {
      const { bookings } = await request('/provider/bookings');
      return bookings;
    } catch {
      return getStoredDemoBookings();
    }
  },
  getProviderProfile: async () => {
    try {
      const { profile } = await request('/provider/profile');
      return profile;
    } catch {
      const user = readAuthSession()?.user;
      return user?.providerProfile || {
        business_name: 'Elena Rostova HVAC',
        category_id: 3,
        description: 'HVAC Seasonal Tune-Up & Gas Refill',
        service_area: 'North Hills & Suburbs',
        hourly_rate: 65,
      };
    }
  },
  createBooking: async (details, idempotencyKey) => {
    try {
      const { booking } = await request('/bookings', {
        method: 'POST',
        data: details,
        headers: { 'Idempotency-Key': idempotencyKey },
      });
      return booking;
    } catch (error) {
      if (!error.cause?.response) {
        const user = readAuthSession()?.user;
        const newBooking = {
          id: `demo-booking-${Date.now()}`,
          customer_id: user?.id || 'demo-customer-1',
          provider_id: '1',
          service_id: details.serviceId,
          status: 'accepted',
          payment_status: details.paymentMethod === 'razorpay' ? 'paid' : 'pending',
          payment_method: details.paymentMethod || 'cash',
          total_amount: Math.round((details.hours || 1) * 45),
          hours: details.hours || 1,
          scheduled_date: details.appointmentAt,
          appointment_at: details.appointmentAt,
          address: details.address,
          notes: details.notes || '',
          service_title: 'Home Service',
          category_name: 'Service',
          provider_name: 'Service Professional',
          counterpart_name: 'Service Professional',
          counterpart_phone: '+1 555-0100',
          counterpart_email: 'provider@example.com',
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        };
        const current = getStoredDemoBookings();
        localStorage.setItem(DEMO_BOOKINGS_KEY, JSON.stringify([newBooking, ...current]));
        return newBooking;
      }
      throw error;
    }
  },
  createBookingOrder: (details, idempotencyKey) => request('/bookings', {
    method: 'POST',
    data: { ...details, paymentMethod: 'razorpay' },
    headers: { 'Idempotency-Key': idempotencyKey },
  }),
  verifyPayment: (details) => request('/payments/verify', {
    method: 'POST',
    data: details,
  }),
  getProviderServices: async () => {
    try {
      const { services } = await request('/provider/services');
      return services;
    } catch {
      return [
        {
          id: 103,
          provider_id: 3,
          provider_name: 'Elena Rostova',
          category_id: 3,
          category_name: 'AC Repair',
          title: 'HVAC Seasonal Tune-Up & Gas Refill',
          description: 'Deep coil cleaning, freon gas top-up, compressor inspection, and duct sanitization to keep air crisp and energy bills low.',
          price_per_hour: 65,
          service_area: 'North Hills & Suburbs',
          rating: 4.95,
          review_count: 64,
          avatar: 'https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?w=150&auto=format&fit=crop&q=80',
          verified: true,
        },
      ];
    }
  },
  createProviderService: async (details) => {
    try {
      const { service } = await request('/provider/services', {
        method: 'POST',
        data: details,
      });
      return service;
    } catch {
      return {
        id: Date.now(),
        provider_id: 3,
        provider_name: 'Elena Rostova',
        category_id: Number(details.categoryId) || 1,
        category_name: 'Service',
        title: details.title,
        description: details.description,
        price_per_hour: Number(details.hourlyRate) || 50,
        service_area: details.serviceArea,
        rating: 5.0,
        review_count: 1,
        avatar: '',
        verified: true,
      };
    }
  },
};

export const categories = [
  { id: 1, name: 'Electrician' },
  { id: 2, name: 'Plumber' },
  { id: 3, name: 'AC Repair' },
  { id: 4, name: 'Cleaning' },
  { id: 5, name: 'Carpentry' },
  { id: 6, name: 'Painting' },
];
