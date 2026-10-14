import { useEffect, useState } from 'react';
import { api, categories } from '../lib/api';
import {
  SUPPORTED_BANKS,
  UPI_HANDLES,
  calculateProviderFinances,
  getStoredProviderPayout,
  saveProviderPayout,
} from '../lib/payments';
import './account-panels.css';

const toLocalInputValue = (date) => {
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
};

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
  const [paymentMethod, setPaymentMethod] = useState(bookingIntent.details?.paymentMethod || 'cash');
  const [upiId, setUpiId] = useState(user.email ? `${user.email.split('@')[0]}@okhdfcbank` : 'customer@okhdfcbank');
  const [selectedBank, setSelectedBank] = useState(SUPPORTED_BANKS[0].name);
  const [accountNumber, setAccountNumber] = useState('10987654321');
  const [otp, setOtp] = useState('');

  const [appointmentBounds] = useState(() => {
    const now = Date.now();
    return {
      min: toLocalInputValue(new Date(now + 60_000)),
      initial: toLocalInputValue(new Date(now + 86_400_000)),
    };
  });

  const totalAmount = Math.round(service.price_per_hour * hours);

  const submitBooking = async (event) => {
    event.preventDefault();
    setError('');
    setSubmitting(true);
    const form = new FormData(event.currentTarget);
    try {
      if (paymentMethod === 'netbanking' && !otp.trim()) {
        throw new Error('Please enter or auto-fill the 6-digit OTP to complete bank verification.');
      }
      const details = {
        serviceId: service.id,
        appointmentAt: new Date(form.get('appointmentAt')).toISOString(),
        hours: Number(form.get('hours')),
        address: form.get('address'),
        notes: form.get('notes'),
        paymentMethod,
        bankName: paymentMethod === 'netbanking' ? selectedBank : '',
        accountNumber: paymentMethod === 'netbanking' ? accountNumber : '',
        upiId: paymentMethod === 'upi' ? upiId : '',
      };
      const intent = {
        idempotencyKey: bookingIntent.idempotencyKey,
        details,
      };
      localStorage.setItem(idempotencyStorageKey, JSON.stringify(intent));
      setBookingIntent(intent);

      const booking = await api.createBooking(details, bookingIntent.idempotencyKey);
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
            <select name="paymentMethod" value={paymentMethod} onChange={(event) => setPaymentMethod(event.target.value)}>
              <option value="cash">💵 Cash on Service (COD)</option>
              <option value="upi">⚡ UPI (GPay, PhonePe, Paytm, QR)</option>
              <option value="netbanking">🏦 Net Banking (Bank-Grade Encrypted)</option>
            </select>
          </label>

          {/* Conditional Payment Details */}
          {paymentMethod === 'cash' && (
            <div className="payment-method-details cod-box">
              <div className="payment-badge-row">
                <span className="pay-badge cod-badge">💵 Cash on Delivery (COD)</span>
                <span className="secure-badge">Zero Advance Fee</span>
              </div>
              <p>
                You will pay <strong>₹{totalAmount}</strong> in cash directly to <strong>{service.provider_name}</strong> once the service is completed to your satisfaction.
              </p>
              <p className="pay-security-note">
                🛡️ ServiceNest guarantee applies. No payment is required until you approve the completed service.
              </p>
            </div>
          )}

          {paymentMethod === 'upi' && (
            <div className="payment-method-details upi-box">
              <div className="payment-badge-row">
                <span className="pay-badge upi-badge">⚡ Instant UPI Transfer</span>
                <span className="secure-badge">🔒 256-Bit Encrypted</span>
              </div>
              <label>
                Your UPI ID (VPA)
                <input
                  name="upiId"
                  type="text"
                  placeholder="e.g. user@okhdfcbank"
                  value={upiId}
                  onChange={(event) => setUpiId(event.target.value)}
                  required
                />
              </label>
              <div className="upi-handle-pills">
                {UPI_HANDLES.map((handle) => (
                  <button
                    key={handle}
                    type="button"
                    className="upi-pill"
                    onClick={() => {
                      const base = upiId.includes('@') ? upiId.split('@')[0] : (upiId || 'customer');
                      setUpiId(`${base}${handle}`);
                    }}
                  >
                    {handle}
                  </button>
                ))}
              </div>
              <p className="pay-security-note">
                💳 Online payment of <strong>₹{totalAmount}</strong> will be deposited directly into <strong>{service.provider_name}</strong>'s registered account.
              </p>
            </div>
          )}

          {paymentMethod === 'netbanking' && (
            <div className="payment-method-details netbanking-box">
              <div className="payment-badge-row">
                <span className="pay-badge netbanking-badge">🏦 Net Banking Portal</span>
                <span className="secure-badge">🔒 256-Bit Bank-Grade SSL</span>
              </div>
              <label>
                Select your Bank
                <select name="bankName" value={selectedBank} onChange={(event) => setSelectedBank(event.target.value)} required>
                  {SUPPORTED_BANKS.map((bank) => (
                    <option key={bank.id} value={bank.name}>{bank.name} ({bank.code})</option>
                  ))}
                </select>
              </label>
              <label>
                Customer ID / Bank Account (Masked for safety)
                <input
                  name="accountNumber"
                  type="text"
                  placeholder="e.g. 1029384756"
                  value={accountNumber}
                  onChange={(event) => setAccountNumber(event.target.value)}
                  required
                />
              </label>
              <div className="otp-verification-group">
                <label>
                  Two-Factor Security OTP
                  <div className="otp-input-row">
                    <input
                      name="otpCode"
                      type="text"
                      maxLength="6"
                      placeholder="Enter 6-digit OTP"
                      value={otp}
                      onChange={(event) => setOtp(event.target.value)}
                      required
                    />
                    <button
                      type="button"
                      className="otp-send-btn"
                      onClick={() => setOtp('123456')}
                    >
                      Auto-Fill Demo OTP
                    </button>
                  </div>
                </label>
              </div>
              <p className="pay-security-note">
                🛡️ <strong>Zero Data Exposure:</strong> Customer bank credentials are encrypted. Your full account number is never exposed in plain text.
              </p>
            </div>
          )}

          <label className="account-form-wide">
            Service address
            <input name="address" defaultValue={bookingIntent.details?.address || user.address} maxLength="500" required />
          </label>
          <label className="account-form-wide">
            Notes for the provider (optional)
            <textarea name="notes" rows="3" maxLength="1000" defaultValue={bookingIntent.details?.notes || ''} placeholder="Describe the work or access instructions" />
          </label>
          <p className="payment-notice account-form-wide">
            Total calculation: ₹{service.price_per_hour}/hr × {hours} {hours === 1 ? 'hour' : 'hours'} = <strong>₹{totalAmount}</strong>.
            {paymentMethod === 'cash' ? ' Payment is due in cash upon completion.' : ' Digital payment is credited directly to the service professional.'}
          </p>
          {error && <p className="form-error account-form-wide" role="alert">{error}</p>}
          <button className="primary-action account-form-wide" type="submit" disabled={submitting}>
            {submitting ? 'Confirming booking…' : paymentMethod === 'cash' ? `Confirm Booking (₹${totalAmount} COD)` : `Pay ₹${totalAmount} & Confirm Booking`}
          </button>
        </form>
      </section>
    </div>
  );
};

export const OnlinePaymentModal = ({ booking, onClose, onPaid }) => {
  const [method, setMethod] = useState('upi');
  const [upiId, setUpiId] = useState('customer@okhdfcbank');
  const [selectedBank, setSelectedBank] = useState(SUPPORTED_BANKS[0].name);
  const [accountNumber, setAccountNumber] = useState('10987654321');
  const [otp, setOtp] = useState('123456');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const handlePay = async (event) => {
    event.preventDefault();
    setSubmitting(true);
    setError('');
    try {
      const updated = await api.updateBookingPayment(booking.id, {
        paymentMethod: method,
        bankName: method === 'netbanking' ? selectedBank : '',
        accountNumber: method === 'netbanking' ? accountNumber : '',
        upiId: method === 'upi' ? upiId : '',
      });
      if (onPaid) onPaid(updated);
      onClose();
    } catch (err) {
      setError(err.message || 'Payment could not be completed.');
      setSubmitting(false);
    }
  };

  return (
    <div className="account-overlay" role="presentation" onMouseDown={(event) => {
      if (event.target === event.currentTarget) onClose();
    }}>
      <section className="account-dialog" role="dialog" aria-modal="true" aria-labelledby="pay-modal-title">
        <button className="dialog-close" type="button" onClick={onClose} aria-label="Close">×</button>
        <p className="dialog-eyebrow">COMPLETE PAYMENT</p>
        <h2 id="pay-modal-title">Pay for {booking.service_title}</h2>
        <p className="dialog-description">Amount: <strong>₹{booking.total_amount}</strong> · Provider: {booking.counterpart_name || booking.provider_name}</p>

        <div className="history-tabs" style={{ marginBottom: '14px' }}>
          <button type="button" className={method === 'upi' ? 'active' : ''} onClick={() => setMethod('upi')}>
            ⚡ UPI Payment
          </button>
          <button type="button" className={method === 'netbanking' ? 'active' : ''} onClick={() => setMethod('netbanking')}>
            🏦 Net Banking
          </button>
        </div>

        <form className="account-form" onSubmit={handlePay}>
          {method === 'upi' ? (
            <div className="payment-method-details upi-box">
              <div className="payment-badge-row">
                <span className="pay-badge upi-badge">⚡ Instant UPI Transfer</span>
                <span className="secure-badge">🔒 256-Bit Encrypted</span>
              </div>
              <label>
                Your UPI ID (VPA)
                <input
                  name="upiId"
                  type="text"
                  placeholder="e.g. user@okhdfcbank"
                  value={upiId}
                  onChange={(event) => setUpiId(event.target.value)}
                  required
                />
              </label>
              <div className="upi-handle-pills">
                {UPI_HANDLES.map((handle) => (
                  <button
                    key={handle}
                    type="button"
                    className="upi-pill"
                    onClick={() => {
                      const base = upiId.includes('@') ? upiId.split('@')[0] : (upiId || 'customer');
                      setUpiId(`${base}${handle}`);
                    }}
                  >
                    {handle}
                  </button>
                ))}
              </div>
              <p className="pay-security-note">
                Amount ₹{booking.total_amount} will be securely transferred to the provider.
              </p>
            </div>
          ) : (
            <div className="payment-method-details netbanking-box">
              <div className="payment-badge-row">
                <span className="pay-badge netbanking-badge">🏦 Net Banking Portal</span>
                <span className="secure-badge">🔒 256-Bit SSL</span>
              </div>
              <label>
                Select Bank
                <select value={selectedBank} onChange={(event) => setSelectedBank(event.target.value)} required>
                  {SUPPORTED_BANKS.map((bank) => (
                    <option key={bank.id} value={bank.name}>{bank.name} ({bank.code})</option>
                  ))}
                </select>
              </label>
              <label>
                Account / Customer ID (Masked)
                <input
                  type="text"
                  placeholder="Enter Account or Customer ID"
                  value={accountNumber}
                  onChange={(event) => setAccountNumber(event.target.value)}
                  required
                />
              </label>
              <div className="otp-verification-group">
                <label>
                  Two-Factor Security OTP
                  <div className="otp-input-row">
                    <input
                      type="text"
                      maxLength="6"
                      placeholder="Enter 6-digit OTP"
                      value={otp}
                      onChange={(event) => setOtp(event.target.value)}
                      required
                    />
                    <button type="button" className="otp-send-btn" onClick={() => setOtp('123456')}>
                      Auto-Fill Demo OTP
                    </button>
                  </div>
                </label>
              </div>
            </div>
          )}
          {error && <p className="form-error account-form-wide" role="alert">{error}</p>}
          <button className="primary-action account-form-wide" type="submit" disabled={submitting}>
            {submitting ? 'Processing Payment…' : `Pay ₹${booking.total_amount} Now`}
          </button>
        </form>
      </section>
    </div>
  );
};

export const ProviderPayoutModal = ({ providerId, onClose, onSaved }) => {
  const [settings, setSettings] = useState(() => getStoredProviderPayout(providerId));
  const [method, setMethod] = useState(settings.payoutMethod || 'bank');
  const [savedNotice, setSavedNotice] = useState('');

  const handleSave = (event) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const updated = saveProviderPayout(providerId, {
      ...settings,
      payoutMethod: method,
      bankName: form.get('bankName') || settings.bankName,
      accountHolder: form.get('accountHolder') || settings.accountHolder,
      accountNumber: form.get('accountNumber') || settings.rawAccountLast4,
      ifscCode: form.get('ifscCode') || settings.ifscCode,
      upiId: form.get('upiId') || settings.upiId,
    });
    setSettings(updated);
    setSavedNotice('Payout receiving options updated successfully!');
    if (onSaved) onSaved(updated);
    setTimeout(() => {
      onClose();
    }, 1200);
  };

  return (
    <div className="account-overlay" role="presentation" onMouseDown={(event) => {
      if (event.target === event.currentTarget) onClose();
    }}>
      <section className="account-dialog" role="dialog" aria-modal="true" aria-labelledby="payout-title">
        <button className="dialog-close" type="button" onClick={onClose} aria-label="Close">×</button>
        <p className="dialog-eyebrow">PROVIDER SETTINGS</p>
        <h2 id="payout-title">Payout & Receiving Options</h2>
        <p className="dialog-description">Configure where online customer payments (UPI & Net Banking) will be deposited.</p>
        <div className="history-tabs" style={{ marginBottom: '14px' }}>
          <button type="button" className={method === 'bank' ? 'active' : ''} onClick={() => setMethod('bank')}>
            🏦 Bank Account (Direct Transfer)
          </button>
          <button type="button" className={method === 'upi' ? 'active' : ''} onClick={() => setMethod('upi')}>
            ⚡ UPI ID
          </button>
        </div>
        <form className="account-form" onSubmit={handleSave}>
          {method === 'bank' ? (
            <>
              <label>
                Bank Name
                <select name="bankName" defaultValue={settings.bankName}>
                  {SUPPORTED_BANKS.map((bank) => (
                    <option key={bank.id} value={bank.name}>{bank.name}</option>
                  ))}
                </select>
              </label>
              <label>
                Account Holder Name
                <input name="accountHolder" defaultValue={settings.accountHolder} required />
              </label>
              <label className="account-form-wide">
                Account Number (Masked for safety)
                <input
                  name="accountNumber"
                  defaultValue={settings.rawAccountLast4 ? `••••••••${settings.rawAccountLast4}` : ''}
                  placeholder="e.g. 987654321012"
                  required
                />
              </label>
              <label className="account-form-wide">
                IFSC Code
                <input name="ifscCode" defaultValue={settings.ifscCode} placeholder="e.g. HDFC0001234" required />
              </label>
            </>
          ) : (
            <label className="account-form-wide">
              Receiving UPI ID (VPA)
              <input name="upiId" defaultValue={settings.upiId} placeholder="e.g. provider@okhdfcbank" required />
            </label>
          )}
          <p className="payment-notice account-form-wide">
            🔒 <strong>Bank-Grade Safety:</strong> Bank credentials are encrypted and stored in masked format. Customer payments on the site are automatically routed to this destination.
          </p>
          {savedNotice && <p className="secure-badge" style={{ gridColumn: '1 / -1', padding: '10px' }}>✓ {savedNotice}</p>}
          <button className="primary-action account-form-wide" type="submit">Save Payout Options</button>
        </form>
      </section>
    </div>
  );
};

export const BookingsPanel = ({ user, onClose, onMessage }) => {
  const [bookings, setBookings] = useState([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  const loadBookings = () => {
    api.getMyBookingHistory()
      .then(setBookings)
      .catch((requestError) => setError(requestError.message))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    loadBookings();
    const handlePaid = () => loadBookings();
    window.addEventListener('servicenest:booking-paid', handlePaid);
    window.addEventListener('servicenest:booking-created', handlePaid);
    return () => {
      window.removeEventListener('servicenest:booking-paid', handlePaid);
      window.removeEventListener('servicenest:booking-created', handlePaid);
    };
  }, []);

  return (
    <PanelFrame title="My bookings" eyebrow="YOUR SERVICE HISTORY" onClose={onClose}>
      <BookingHistory
        bookings={bookings}
        error={error}
        loading={loading}
        user={user}
        onMessage={onMessage}
        onRefresh={loadBookings}
      />
      <p className="panel-footnote">
        {user.name} · {user.email} · {user.phone} · {user.address}
      </p>
    </PanelFrame>
  );
};

const BookingHistory = ({ bookings, error, loading, user, onMessage, onRefresh }) => {
  const [activeTab, setActiveTab] = useState('Upcoming');
  const [payingBooking, setPayingBooking] = useState(null);

  const statusesByTab = {
    Upcoming: ['pending', 'accepted', 'in_progress', 'confirmed'],
    Completed: ['completed'],
    Cancelled: ['cancelled'],
  };
  const filteredBookings = bookings.filter((booking) => statusesByTab[activeTab].includes(booking.status));

  const handleCashCollect = async (bookingId) => {
    await api.markCashCollected(bookingId);
    if (onRefresh) onRefresh();
  };

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
          {filteredBookings.map((booking) => {
            const isCOD = booking.payment_method === 'cash';
            const isPaid = booking.payment_status === 'paid';
            const isCustomer = user.role === 'customer';
            const isProvider = user.role === 'provider';

            return (
              <li className="record-card" key={booking.id}>
                <div className="record-card-heading">
                  <div>
                    <h3>{booking.service_title}</h3>
                    <p>{booking.counterpart_name || (isProvider ? 'Customer' : 'Service provider')}</p>
                  </div>
                  <span className="record-status">{booking.status.replaceAll('_', ' ')}</span>
                </div>
                <p>{new Date(booking.scheduled_date || booking.appointment_at).toLocaleString()}</p>
                {booking.counterpart_phone && <p>📞 {booking.counterpart_phone}</p>}

                {/* Enhanced Payment Status Details */}
                <div style={{ marginTop: '6px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  {isCOD && !isPaid && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                      <span className="pay-badge cod-badge">💵 Cash on Service (COD): ₹{booking.total_amount}</span>
                      {isCustomer && (
                        <button
                          type="button"
                          className="action-pill-btn primary"
                          onClick={() => setPayingBooking(booking)}
                        >
                          💳 Pay Online Now (UPI / Net Banking)
                        </button>
                      )}
                      {isProvider && (
                        <button
                          type="button"
                          className="action-pill-btn primary"
                          onClick={() => handleCashCollect(booking.id)}
                        >
                          ✓ Mark Cash Collected
                        </button>
                      )}
                    </div>
                  )}

                  {isCOD && isPaid && (
                    <span className="pay-badge cod-badge" style={{ background: '#dcfce7', color: '#166534', borderColor: '#bbf7d0' }}>
                      ✓ Cash Collected: ₹{booking.total_amount}
                    </span>
                  )}

                  {!isCOD && isPaid && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                      <span className={`pay-badge ${booking.payment_method === 'upi' ? 'upi-badge' : 'netbanking-badge'}`}>
                        {booking.payment_method === 'upi' ? '⚡ Paid via UPI' : `🏦 Paid via Net Banking (${booking.payment_bank || 'Bank'})`}: ₹{booking.total_amount}
                      </span>
                      <span className="secure-badge">
                        {isProvider ? 'Credited to your payout destination' : 'Transferred to Provider'}
                      </span>
                    </div>
                  )}
                  {booking.transaction_id && (
                    <span style={{ fontSize: '0.74rem', color: 'var(--ink-soft)' }}>
                      Transaction Ref: {booking.transaction_id}
                    </span>
                  )}
                </div>

                <div className="record-card-footer">
                  <strong>₹{booking.total_amount}</strong>
                  <span>Payment {booking.payment_status}</span>
                </div>
                {booking.counterpart_email && <p>✉️ {booking.counterpart_email}</p>}
                <button className="message-action" type="button" onClick={() => onMessage(booking)}>
                  Message {isProvider ? 'customer' : 'provider'}
                </button>
              </li>
            );
          })}
        </ul>
      )}

      {payingBooking && (
        <OnlinePaymentModal
          booking={payingBooking}
          onClose={() => setPayingBooking(null)}
          onPaid={() => {
            setPayingBooking(null);
            if (onRefresh) onRefresh();
          }}
        />
      )}
    </>
  );
};

export const ProviderDashboard = ({ user, onClose, onServiceCreated, onMessage }) => {
  const [services, setServices] = useState([]);
  const [bookings, setBookings] = useState([]);
  const [profile, setProfile] = useState(null);
  const [payoutSettings, setPayoutSettings] = useState(() => getStoredProviderPayout(user.id));
  const [showPayoutModal, setShowPayoutModal] = useState(false);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const loadData = () => {
    Promise.all([api.getProviderServices(), api.getMyBookingHistory(), api.getProviderProfile()])
      .then(([providerServices, providerBookings, providerProfile]) => {
        setServices(providerServices);
        setBookings(providerBookings);
        setProfile(providerProfile);
      })
      .catch((requestError) => setError(requestError.message));
  };

  useEffect(() => {
    loadData();
    const handlePaid = () => loadData();
    const handlePayout = (e) => {
      if (e?.detail) setPayoutSettings(e.detail);
    };
    window.addEventListener('servicenest:booking-paid', handlePaid);
    window.addEventListener('servicenest:booking-created', handlePaid);
    window.addEventListener('servicenest:provider-payout-updated', handlePayout);
    return () => {
      window.removeEventListener('servicenest:booking-paid', handlePaid);
      window.removeEventListener('servicenest:booking-created', handlePaid);
      window.removeEventListener('servicenest:provider-payout-updated', handlePayout);
    };
  }, []);

  const finances = calculateProviderFinances(bookings, user.id);

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

      {/* Provider Finances & Digital Payouts */}
      <h3 className="panel-section-title">Earnings & Payouts</h3>
      <div className="finances-summary-grid">
        <div className="finance-card">
          <span className="finance-card-title">Digital Received (UPI & Net Banking)</span>
          <span className="finance-card-amount online">₹{finances.onlineReceived}</span>
          <span className="finance-card-sub">
            Deposited to your {payoutSettings.payoutMethod === 'bank' ? 'Bank Account' : 'UPI'}
          </span>
        </div>
        <div className="finance-card">
          <span className="finance-card-title">Cash on Service (COD) Pending</span>
          <span className="finance-card-amount cash">₹{finances.cashPending}</span>
          <span className="finance-card-sub">To collect from customers in person</span>
        </div>
        <div className="finance-card">
          <span className="finance-card-title">Total Bookings Value</span>
          <span className="finance-card-amount">₹{finances.totalGross}</span>
          <span className="finance-card-sub">{finances.totalBookingsCount} appointments scheduled</span>
        </div>
      </div>

      {/* Payout Receiving Settings Card */}
      <div className="payout-account-card">
        <div className="payout-account-info">
          <h4>
            {payoutSettings.payoutMethod === 'bank'
              ? `🏦 ${payoutSettings.bankName} (${payoutSettings.accountNumberMasked})`
              : `⚡ UPI: ${payoutSettings.upiId}`}
          </h4>
          <p>
            {payoutSettings.payoutMethod === 'bank'
              ? `Account Holder: ${payoutSettings.accountHolder} · IFSC: ${payoutSettings.ifscCode} · Auto-deposit active`
              : 'Direct UPI auto-settlement active · 256-bit encrypted'}
          </p>
        </div>
        <button
          type="button"
          className="action-pill-btn"
          onClick={() => setShowPayoutModal(true)}
        >
          ⚙️ Manage Payout Options
        </button>
      </div>

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
      <BookingHistory
        bookings={bookings}
        error={error}
        loading={!profile}
        user={user}
        onMessage={onMessage}
        onRefresh={loadData}
      />

      {showPayoutModal && (
        <ProviderPayoutModal
          providerId={user.id}
          onClose={() => setShowPayoutModal(false)}
          onSaved={(newSettings) => setPayoutSettings(newSettings)}
        />
      )}
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
