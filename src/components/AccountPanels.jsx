import { useEffect, useState } from 'react';
import { api, categories } from '../lib/api';
import './account-panels.css';

const toLocalInputValue = (date) => {
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
};

const loadRazorpayCheckout = () => new Promise((resolve, reject) => {
  if (window.Razorpay) {
    resolve();
    return;
  }
  const script = document.createElement('script');
  script.src = 'https://checkout.razorpay.com/v1/checkout.js';
  script.async = true;
  script.onload = () => resolve();
  script.onerror = () => reject(new Error('Could not load secure checkout. Please try again.'));
  document.body.appendChild(script);
});

export const BookingDialog = ({ service, user, onClose, onBooked }) => {
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const idempotencyStorageKey = `servicenest_booking_intent_${user.id}_${service.id}`;
  const [bookingIntent, setBookingIntent] = useState(() => {
    const saved = localStorage.getItem(idempotencyStorageKey);
    if (saved) {
      try {
        const intent = JSON.parse(saved);
        if (intent?.idempotencyKey) return intent;
      } catch {
        return { idempotencyKey: saved, details: null };
      }
    }
    return { idempotencyKey: crypto.randomUUID().replaceAll('-', ''), details: null };
  });
  const [hours, setHours] = useState(bookingIntent.details?.hours || 1);
  const [appointmentBounds] = useState(() => {
    const now = Date.now();
    return {
      min: toLocalInputValue(new Date(now + 60_000)),
      initial: toLocalInputValue(new Date(now + 86_400_000)),
    };
  });

  const submitBooking = async (event) => {
    event.preventDefault();
    setError('');
    setSubmitting(true);
    const form = new FormData(event.currentTarget);
    try {
      const details = {
        serviceId: service.id,
        appointmentAt: new Date(form.get('appointmentAt')).toISOString(),
        hours: Number(form.get('hours')),
        address: form.get('address'),
        notes: form.get('notes'),
      };
      const paymentMethod = form.get('paymentMethod');
      const intent = {
        idempotencyKey: bookingIntent.idempotencyKey,
        details: { ...details, paymentMethod },
      };
      localStorage.setItem(idempotencyStorageKey, JSON.stringify(intent));
      setBookingIntent(intent);
      if (paymentMethod === 'razorpay') {
        const order = await api.createBookingOrder(details, bookingIntent.idempotencyKey);
        if (order.booking.payment_status === 'paid') {
          localStorage.removeItem(idempotencyStorageKey);
          onBooked(order.booking);
          return;
        }
        if (!order.razorpay) {
          throw new Error('This idempotency key is already associated with a booking without a payment order. Open booking history to review it.');
        }
        await loadRazorpayCheckout();
        const checkout = new window.Razorpay({
          key: order.razorpay.keyId,
          order_id: order.razorpay.orderId,
          amount: order.razorpay.amount,
          currency: order.razorpay.currency,
          name: 'ServiceNest',
          description: service.title,
          prefill: { name: user.name, email: user.email, contact: user.phone },
          handler: async (paymentResult) => {
            try {
              await api.verifyPayment(paymentResult);
              localStorage.removeItem(idempotencyStorageKey);
              onBooked(order.booking);
            } catch (verificationError) {
              setError(`${verificationError.message} Payment confirmation will also be checked securely by the payment provider.`);
              setSubmitting(false);
            }
          },
          modal: {
            ondismiss: () => setSubmitting(false),
          },
          theme: { color: '#138a82' },
        });
        checkout.on('payment.failed', (paymentFailure) => {
          setError(paymentFailure.error?.description || 'Payment was not completed. Your booking remains unpaid.');
          setSubmitting(false);
        });
        checkout.open();
        return;
      }
      const booking = await api.createBooking({ ...details, paymentMethod: 'cash' }, bookingIntent.idempotencyKey);
      localStorage.removeItem(idempotencyStorageKey);
      onBooked(booking);
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="account-overlay" role="presentation" onMouseDown={(event) => {
      if (event.target === event.currentTarget) onClose();
    }}>
      <section className="account-dialog" role="dialog" aria-modal="true" aria-labelledby="booking-title">
        <button className="dialog-close" type="button" onClick={onClose} aria-label="Close booking">×</button>
        <p className="dialog-eyebrow">BOOK A PROFESSIONAL</p>
        <h2 id="booking-title">{service.title}</h2>
        <p className="dialog-description">{service.provider_name} · ₹{service.price_per_hour}/hour</p>
        <form className="account-form booking-form" onSubmit={submitBooking}>
          <label className="account-form-wide">
            Appointment date and time
            <input
              name="appointmentAt"
              type="datetime-local"
              min={appointmentBounds.min}
              defaultValue={bookingIntent.details?.appointmentAt
                ? toLocalInputValue(new Date(bookingIntent.details.appointmentAt))
                : appointmentBounds.initial}
              required
            />
          </label>
          <label>
            Estimated hours
            <input name="hours" type="number" min="1" max="24" step="0.5" value={hours} onChange={(event) => setHours(Number(event.target.value))} required />
          </label>
          <label>
            Payment method
            <select name="paymentMethod" defaultValue={bookingIntent.details?.paymentMethod || 'cash'}>
              <option value="cash">Cash after service</option>
              <option value="razorpay">Pay securely with Razorpay</option>
            </select>
          </label>
          <label className="account-form-wide">
            Service address
            <input name="address" defaultValue={bookingIntent.details?.address || user.address} maxLength="500" required />
          </label>
          <label className="account-form-wide">
            Notes for the provider (optional)
            <textarea name="notes" rows="3" maxLength="1000" defaultValue={bookingIntent.details?.notes || ''} placeholder="Describe the work or access instructions" />
          </label>
          <p className="payment-notice account-form-wide">
            Estimated total: ₹{(service.price_per_hour * hours).toFixed(2)}.
            Online payment status is confirmed by the payment webhook. Card and bank details are handled by Razorpay, not stored by ServiceNest.
          </p>
          {error && <p className="form-error account-form-wide" role="alert">{error}</p>}
          <button className="primary-action account-form-wide" type="submit" disabled={submitting}>
            {submitting ? 'Confirming booking…' : 'Confirm booking'}
          </button>
        </form>
      </section>
    </div>
  );
};

export const BookingsPanel = ({ user, onClose, onMessage }) => {
  const [bookings, setBookings] = useState([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.getMyBookingHistory()
      .then(setBookings)
      .catch((requestError) => setError(requestError.message))
      .finally(() => setLoading(false));
  }, []);

  return (
    <PanelFrame title="My bookings" eyebrow="YOUR SERVICE HISTORY" onClose={onClose}>
      <BookingHistory bookings={bookings} error={error} loading={loading} user={user} onMessage={onMessage} />
      <p className="panel-footnote">
        {user.name} · {user.email} · {user.phone} · {user.address}
      </p>
    </PanelFrame>
  );
};

const BookingHistory = ({ bookings, error, loading, user, onMessage }) => {
  const [activeTab, setActiveTab] = useState('Upcoming');
  const statusesByTab = {
    Upcoming: ['pending', 'accepted', 'in_progress', 'confirmed'],
    Completed: ['completed'],
    Cancelled: ['cancelled'],
  };
  const filteredBookings = bookings.filter((booking) => statusesByTab[activeTab].includes(booking.status));

  if (error) return <p className="form-error" role="alert">{error}</p>;
  if (loading) return <p className="panel-empty">Loading booking history…</p>;

  return (
    <>
      <div className="history-tabs" role="tablist" aria-label="Filter bookings">
        {Object.keys(statusesByTab).map((tab) => (
          <button
            key={tab}
            type="button"
            role="tab"
            aria-selected={activeTab === tab}
            className={activeTab === tab ? 'active' : ''}
            onClick={() => setActiveTab(tab)}
          >
            {tab}
          </button>
        ))}
      </div>
      {filteredBookings.length === 0 ? (
        <p className="panel-empty">No {activeTab.toLowerCase()} bookings.</p>
      ) : (
        <ul className="record-list">
          {filteredBookings.map((booking) => (
            <li className="record-card" key={booking.id}>
              <div className="record-card-heading">
                <div>
                  <h3>{booking.service_title}</h3>
                  <p>{booking.counterpart_name || (user.role === 'provider' ? 'Customer' : 'Service provider')}</p>
                </div>
                <span className="record-status">{booking.status.replaceAll('_', ' ')}</span>
              </div>
              <p>{new Date(booking.scheduled_date || booking.appointment_at).toLocaleString()}</p>
              {booking.counterpart_phone && <p>{booking.counterpart_phone}</p>}
              <div className="record-card-footer">
                <strong>₹{booking.total_amount}</strong>
                <span>Payment {booking.payment_status}</span>
              </div>
              {booking.counterpart_email && <p>{booking.counterpart_email}</p>}
              <button className="message-action" type="button" onClick={() => onMessage(booking)}>
                Message {user.role === 'provider' ? 'customer' : 'provider'}
              </button>
            </li>
          ))}
        </ul>
      )}
    </>
  );
};

export const ProviderDashboard = ({ user, onClose, onServiceCreated, onMessage }) => {
  const [services, setServices] = useState([]);
  const [bookings, setBookings] = useState([]);
  const [profile, setProfile] = useState(null);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    Promise.all([api.getProviderServices(), api.getMyBookingHistory(), api.getProviderProfile()])
      .then(([providerServices, providerBookings, providerProfile]) => {
        setServices(providerServices);
        setBookings(providerBookings);
        setProfile(providerProfile);
      })
      .catch((requestError) => setError(requestError.message));
  }, []);

  const addService = async (event) => {
    event.preventDefault();
    setError('');
    setSubmitting(true);
    const form = new FormData(event.currentTarget);
    const formElement = event.currentTarget;
    try {
      const service = await api.createProviderService({
        title: form.get('title'),
        categoryId: Number(form.get('categoryId')),
        description: form.get('description'),
        serviceArea: form.get('serviceArea'),
        hourlyRate: Number(form.get('hourlyRate')),
      });
      setServices((current) => [service, ...current]);
      formElement.reset();
      onServiceCreated(service);
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <PanelFrame title="Provider dashboard" eyebrow={`WELCOME, ${user.name.toUpperCase()}`} onClose={onClose}>
      {profile && (
        <p className="provider-profile-summary">
          {profile.business_name} · {categories.find((category) => category.id === profile.category_id)?.name}
          {' · '}{profile.service_area} · ₹{profile.hourly_rate}/hour
        </p>
      )}
      <h3 className="panel-section-title">Publish a service</h3>
      <form className="account-form provider-service-form" onSubmit={addService}>
        <label className="account-form-wide">Service title<input name="title" maxLength="120" required /></label>
        <label>Category<select name="categoryId" defaultValue="1">{categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}</select></label>
        <label>Hourly rate (₹)<input name="hourlyRate" type="number" min="1" max="100000" step="0.01" required /></label>
        <label className="account-form-wide">Service area<input name="serviceArea" maxLength="200" required /></label>
        <label className="account-form-wide">Description<textarea name="description" rows="3" maxLength="1000" required /></label>
        <button className="primary-action account-form-wide" type="submit" disabled={submitting}>{submitting ? 'Publishing…' : 'Publish service'}</button>
      </form>
      {error && <p className="form-error panel-error" role="alert">{error}</p>}
      <h3 className="panel-section-title">Your listings <span>{services.length}</span></h3>
      {services.length > 0 && (
        <>
          <ul className="listing-chips">
            {services.map((service) => <li key={service.id}>{service.title} · ₹{service.price_per_hour}/hr</li>)}
          </ul>
          <button
            type="button"
            className="message-action"
            style={{ marginTop: '10px' }}
            onClick={onClose}
          >
            View in Customer Marketplace →
          </button>
        </>
      )}
      <h3 className="panel-section-title">Booking history <span>{bookings.length}</span></h3>
      <BookingHistory bookings={bookings} error={error} loading={!profile} user={user} onMessage={onMessage} />
    </PanelFrame>
  );
};

export const BookingConversation = ({ booking, user, onClose }) => {
  const [messages, setMessages] = useState([]);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);

  useEffect(() => {
    let active = true;
    const loadMessages = () => api.getBookingMessages(booking.id)
      .then((savedMessages) => {
        if (active) {
          setMessages((current) => {
            const allMessages = new Map(current.map((item) => [item.id, item]));
            for (const item of savedMessages) allMessages.set(item.id, item);
            return [...allMessages.values()].sort((first, second) => (
              first.created_at.localeCompare(second.created_at) || first.id.localeCompare(second.id)
            ));
          });
          setError('');
        }
      })
      .catch((requestError) => {
        if (active) setError(requestError.message);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    loadMessages();
    const interval = window.setInterval(loadMessages, 10_000);
    return () => {
      active = false;
      window.clearInterval(interval);
    };
  }, [booking.id]);

  const sendMessage = async (event) => {
    event.preventDefault();
    if (!message.trim()) return;
    setSending(true);
    setError('');
    try {
      const sentMessage = await api.sendBookingMessage(booking.id, message);
      setMessages((current) => [...current, sentMessage]);
      setMessage('');
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setSending(false);
    }
  };

  const otherParticipant = user.role === 'provider' ? booking.customer_name : booking.provider_name;

  return (
    <div className="account-overlay conversation-overlay" role="presentation" onMouseDown={(event) => {
      if (event.target === event.currentTarget) onClose();
    }}>
      <section className="account-dialog conversation-dialog" role="dialog" aria-modal="true" aria-labelledby="conversation-title">
        <button className="dialog-close" type="button" onClick={onClose} aria-label="Close conversation">×</button>
        <p className="dialog-eyebrow">BOOKING CONVERSATION</p>
        <h2 id="conversation-title">{otherParticipant || 'Client'} · {booking.service_title}</h2>
        <div className="conversation-messages" aria-live="polite">
          {loading && messages.length === 0 && <p className="panel-empty">Loading messages…</p>}
          {!loading && messages.length === 0 && <p className="panel-empty">Start the conversation about timing, access, or service details.</p>}
          {messages.map((savedMessage) => (
            <article className={`conversation-message${savedMessage.sender_id === user.id ? ' own-message' : ''}`} key={savedMessage.id}>
              <p className="conversation-sender">{savedMessage.sender_name}</p>
              <p>{savedMessage.body}</p>
              <time dateTime={savedMessage.created_at}>{new Date(savedMessage.created_at).toLocaleString()}</time>
            </article>
          ))}
        </div>
        {error && <p className="form-error conversation-error" role="alert">{error}</p>}
        <form className="conversation-form" onSubmit={sendMessage}>
          <label className="sr-only" htmlFor="booking-message">Message</label>
          <textarea id="booking-message" value={message} onChange={(event) => setMessage(event.target.value)} maxLength="2000" rows="2" placeholder="Write a message…" required />
          <button className="primary-action" type="submit" disabled={sending || !message.trim()}>
            {sending ? 'Sending…' : 'Send'}
          </button>
        </form>
        <p className="conversation-poll-note">Messages refresh automatically every 10 seconds.</p>
      </section>
    </div>
  );
};

const PanelFrame = ({ title, eyebrow, onClose, children }) => (
  <div className="account-overlay" role="presentation" onMouseDown={(event) => {
    if (event.target === event.currentTarget) onClose();
  }}>
    <section className="account-dialog panel-dialog" role="dialog" aria-modal="true" aria-labelledby="panel-title">
      <button className="dialog-close" type="button" onClick={onClose} aria-label="Close panel">×</button>
      <p className="dialog-eyebrow">{eyebrow}</p>
      <h2 id="panel-title">{title}</h2>
      {children}
    </section>
  </div>
);
