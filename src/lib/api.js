import axios from 'axios';
import { clearAuthSession, readAuthSession, saveAuthSession } from './auth-session';
import { getAllMergedServices, getStoredCustomServices, INITIAL_SERVICES, saveCustomService } from './services-data';
import { maskAccountNumber, maskUpiId } from './payments';

export { getAllMergedServices, getStoredCustomServices, INITIAL_SERVICES, saveCustomService };

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

export const categories = [
  { id: 1, name: 'Electrician' },
  { id: 2, name: 'Plumber' },
  { id: 3, name: 'AC Repair' },
  { id: 4, name: 'Cleaning' },
  { id: 5, name: 'Carpentry' },
  { id: 6, name: 'Painting' },
];

export const api = {
  checkAccountService: () => request('/health').then(({ status }) => status === 'ok'),
  getServices: async () => {
    const custom = getStoredCustomServices();
    try {
      const response = await request('/services');
      const backendServices = Array.isArray(response?.services) ? response.services : [];
      const customIds = new Set(custom.map((s) => String(s.id)));
      return { services: [...custom, ...backendServices.filter((s) => !customIds.has(String(s.id)))] };
    } catch {
      return { services: getAllMergedServices() };
    }
  },
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
      const user = readAuthSession()?.user;
      const allBookings = getStoredDemoBookings();
      if (user?.role === 'provider') {
        const userServices = getStoredCustomServices().filter((s) => (
          String(s.provider_id) === String(user.id)
          || s.provider_name === user.name
          || s.provider_name === user.providerProfile?.business_name
        ));
        const userServiceIds = new Set(userServices.map((s) => String(s.id)));
        return allBookings.filter((b) => (
          String(b.provider_id) === String(user.id)
          || b.provider_name === user.name
          || b.provider_name === user.providerProfile?.business_name
          || userServiceIds.has(String(b.service_id))
          || user.email === 'provider@example.com'
        ));
      }
      return allBookings;
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
      const user = readAuthSession()?.user;
      const allBookings = getStoredDemoBookings();
      if (!user) return allBookings;
      const userServices = getStoredCustomServices().filter((s) => (
        String(s.provider_id) === String(user.id)
        || s.provider_name === user.name
        || s.provider_name === user.providerProfile?.business_name
      ));
      const userServiceIds = new Set(userServices.map((s) => String(s.id)));
      return allBookings.filter((b) => (
        String(b.provider_id) === String(user.id)
        || b.provider_name === user.name
        || b.provider_name === user.providerProfile?.business_name
        || userServiceIds.has(String(b.service_id))
        || user.email === 'provider@example.com'
      ));
    }
  },
  getProviderProfile: async () => {
    try {
      const { profile } = await request('/provider/profile');
      return profile;
    } catch {
      const user = readAuthSession()?.user;
      return user?.providerProfile || {
        business_name: user?.name ? `${user.name} Services` : 'Elena Rostova HVAC',
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
        const allServices = getAllMergedServices();
        const matchedService = allServices.find((s) => String(s.id) === String(details.serviceId));
        const method = details.paymentMethod || 'cash';
        const isOnlinePaid = ['upi', 'netbanking', 'razorpay'].includes(method);
        const txnId = isOnlinePaid
          ? `TXN-${method.toUpperCase()}-${Math.random().toString(36).substring(2, 9).toUpperCase()}`
          : null;

        const newBooking = {
          id: `demo-booking-${Date.now()}`,
          customer_id: user?.id || 'demo-customer-1',
          customer_name: user?.name || 'Demo Customer',
          customer_email: user?.email || 'customer@example.com',
          customer_phone: user?.phone || '+1 555-0199',
          customer_address: details.address || user?.address || '123 Market St',
          provider_id: matchedService?.provider_id || '1',
          provider_name: matchedService?.provider_name || 'Service Professional',
          service_id: details.serviceId,
          service_title: matchedService?.title || 'Home Service',
          category_name: matchedService?.category_name || 'Service',
          status: 'accepted',
          payment_status: isOnlinePaid ? 'paid' : 'pending',
          payment_method: method,
          transaction_id: txnId,
          payment_bank: details.bankName || '',
          payment_upi: details.upiId ? maskUpiId(details.upiId) : '',
          payment_account_masked: details.accountNumber ? maskAccountNumber(details.accountNumber) : '',
          paid_at: isOnlinePaid ? new Date().toISOString() : null,
          total_amount: Math.round((details.hours || 1) * (matchedService?.price_per_hour || 45)),
          hours: details.hours || 1,
          scheduled_date: details.appointmentAt,
          appointment_at: details.appointmentAt,
          address: details.address || user?.address || '123 Market St',
          notes: details.notes || '',
          counterpart_name: matchedService?.provider_name || 'Service Professional',
          counterpart_phone: '+1 555-0100',
          counterpart_email: 'provider@example.com',
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        };
        const current = getStoredDemoBookings();
        localStorage.setItem(DEMO_BOOKINGS_KEY, JSON.stringify([newBooking, ...current]));
        window.dispatchEvent(new CustomEvent('servicenest:booking-created', { detail: newBooking }));
        return newBooking;
      }
      throw error;
    }
  },
  updateBookingPayment: async (bookingId, paymentData) => {
    const current = getStoredDemoBookings();
    const index = current.findIndex((b) => String(b.id) === String(bookingId));
    if (index >= 0) {
      const method = paymentData.paymentMethod || 'upi';
      const txnId = `TXN-${method.toUpperCase()}-${Math.random().toString(36).substring(2, 9).toUpperCase()}`;
      const updated = [...current];
      updated[index] = {
        ...updated[index],
        payment_status: 'paid',
        payment_method: method,
        transaction_id: txnId,
        payment_bank: paymentData.bankName || '',
        payment_upi: paymentData.upiId ? maskUpiId(paymentData.upiId) : '',
        payment_account_masked: paymentData.accountNumber ? maskAccountNumber(paymentData.accountNumber) : '',
        paid_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      localStorage.setItem(DEMO_BOOKINGS_KEY, JSON.stringify(updated));
      window.dispatchEvent(new CustomEvent('servicenest:booking-paid', { detail: updated[index] }));
      return updated[index];
    }
    return null;
  },
  markCashCollected: async (bookingId) => {
    const current = getStoredDemoBookings();
    const index = current.findIndex((b) => String(b.id) === String(bookingId));
    if (index >= 0) {
      const updated = [...current];
      updated[index] = {
        ...updated[index],
        payment_status: 'paid',
        status: 'completed',
        transaction_id: `COD-COLLECTED-${String(bookingId).slice(-6)}`,
        updated_at: new Date().toISOString(),
      };
      localStorage.setItem(DEMO_BOOKINGS_KEY, JSON.stringify(updated));
      window.dispatchEvent(new CustomEvent('servicenest:booking-paid', { detail: updated[index] }));
      return updated[index];
    }
    return null;
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
    const session = readAuthSession();
    const user = session?.user;
    try {
      const { services } = await request('/provider/services');
      const custom = getStoredCustomServices().filter((s) => (
        !user
        || String(s.provider_id) === String(user.id)
        || s.provider_name === user.name
        || s.provider_name === user.providerProfile?.business_name
      ));
      const ids = new Set(services.map((s) => String(s.id)));
      return [...services, ...custom.filter((s) => !ids.has(String(s.id)))];
    } catch {
      const allCustom = getStoredCustomServices();
      const userCustom = allCustom.filter((s) => (
        !user
        || String(s.provider_id) === String(user.id)
        || s.provider_name === user.name
        || s.provider_name === user.providerProfile?.business_name
      ));
      if (userCustom.length > 0) {
        return userCustom;
      }
      if (user?.providerProfile) {
        const catName = categories.find((category) => category.id === user.providerProfile.category_id)?.name || 'Service';
        return [
          {
            id: `svc-${user.id || 'demo'}`,
            provider_id: user.id || 3,
            provider_name: user.providerProfile.business_name || user.name,
            category_id: user.providerProfile.category_id || 1,
            category_name: catName,
            title: `${user.providerProfile.business_name || user.name} Service`,
            description: user.providerProfile.description || 'Professional home service.',
            price_per_hour: user.providerProfile.hourly_rate || 45,
            service_area: user.providerProfile.service_area || 'Metro City',
            rating: 5.0,
            review_count: 1,
            avatar: '',
            verified: true,
          },
        ];
      }
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
    const session = readAuthSession();
    const user = session?.user;
    const categoryId = Number(details.categoryId) || 1;
    const categoryName = categories.find((category) => category.id === categoryId)?.name || 'Home Services';
    const providerName = user?.providerProfile?.business_name || user?.name || 'Local Service Pro';
    const providerId = user?.id || `prov-${Date.now()}`;
    const hourlyRate = Number(details.hourlyRate) || Number(user?.providerProfile?.hourly_rate) || 45;

    let serviceToSave;
    try {
      const { service } = await request('/provider/services', {
        method: 'POST',
        data: details,
      });
      serviceToSave = service;
    } catch {
      serviceToSave = {
        id: `svc-${Date.now()}`,
        provider_id: providerId,
        provider_name: providerName,
        category_id: categoryId,
        category_name: categoryName,
        title: details.title || `${categoryName} by ${providerName}`,
        description: details.description || user?.providerProfile?.description || `Professional ${categoryName.toLowerCase()} services.`,
        price_per_hour: hourlyRate,
        service_area: details.serviceArea || user?.providerProfile?.service_area || 'Metro City',
        rating: 5.0,
        review_count: 1,
        avatar: user?.avatar || 'https://images.unsplash.com/photo-1540569014015-19a7be504e3a?w=150&auto=format&fit=crop&q=80',
        verified: true,
      };
    }

    saveCustomService(serviceToSave);
    return serviceToSave;
  },
};

