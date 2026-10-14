export const SUPPORTED_BANKS = [
  { id: 'hdfc', name: 'HDFC Bank', code: 'HDFC' },
  { id: 'sbi', name: 'State Bank of India', code: 'SBIN' },
  { id: 'icici', name: 'ICICI Bank', code: 'ICIC' },
  { id: 'axis', name: 'Axis Bank', code: 'UTIB' },
  { id: 'kotak', name: 'Kotak Mahindra Bank', code: 'KKBK' },
  { id: 'pnb', name: 'Punjab National Bank', code: 'PUNB' },
  { id: 'bob', name: 'Bank of Baroda', code: 'BARB' },
  { id: 'canara', name: 'Canara Bank', code: 'CNRB' },
];

export const UPI_HANDLES = ['@okhdfcbank', '@oksbi', '@paytm', '@ybl', '@ibl', '@upi'];

export const maskAccountNumber = (accountNumber) => {
  if (!accountNumber) return '';
  const cleaned = String(accountNumber).replace(/\s+/g, '');
  if (cleaned.length <= 4) return cleaned;
  const last4 = cleaned.slice(-4);
  return `•••• •••• ${last4}`;
};

export const maskUpiId = (upiId) => {
  if (!upiId) return '';
  const parts = upiId.split('@');
  if (parts.length < 2) return upiId;
  const prefix = parts[0];
  const domain = parts[1];
  const maskedPrefix = prefix.length <= 3 ? prefix : `${prefix.slice(0, 3)}••••`;
  return `${maskedPrefix}@${domain}`;
};

export const PROVIDER_PAYOUTS_KEY = 'servicenest_provider_payouts';

export const getStoredProviderPayout = (providerId) => {
  try {
    const raw = localStorage.getItem(PROVIDER_PAYOUTS_KEY);
    const all = raw ? JSON.parse(raw) : {};
    return all[providerId] || {
      providerId: providerId || 'default',
      payoutMethod: 'bank',
      bankName: 'HDFC Bank',
      accountHolder: 'Provider Account',
      accountNumberMasked: '•••• •••• 5678',
      rawAccountLast4: '5678',
      ifscCode: 'HDFC0001234',
      upiId: 'provider@okhdfcbank',
      autoTransfer: true,
      lastUpdated: new Date().toISOString(),
    };
  } catch {
    return {
      providerId: providerId || 'default',
      payoutMethod: 'bank',
      bankName: 'HDFC Bank',
      accountHolder: 'Provider Account',
      accountNumberMasked: '•••• •••• 5678',
      rawAccountLast4: '5678',
      ifscCode: 'HDFC0001234',
      upiId: 'provider@okhdfcbank',
      autoTransfer: true,
      lastUpdated: new Date().toISOString(),
    };
  }
};

export const saveProviderPayout = (providerId, settings) => {
  try {
    const raw = localStorage.getItem(PROVIDER_PAYOUTS_KEY);
    const all = raw ? JSON.parse(raw) : {};
    const sanitized = {
      ...settings,
      providerId: providerId || 'default',
      accountNumberMasked: maskAccountNumber(settings.accountNumber || settings.accountNumberMasked || '5678'),
      rawAccountLast4: String(settings.accountNumber || settings.rawAccountLast4 || '5678').slice(-4),
      lastUpdated: new Date().toISOString(),
    };
    all[providerId || 'default'] = sanitized;
    localStorage.setItem(PROVIDER_PAYOUTS_KEY, JSON.stringify(all));
    window.dispatchEvent(new CustomEvent('servicenest:provider-payout-updated', { detail: sanitized }));
    return sanitized;
  } catch {
    return settings;
  }
};

export const calculateProviderFinances = (bookings, providerId) => {
  const matchingBookings = (bookings || []).filter((booking) => (
    !providerId
    || String(booking.provider_id) === String(providerId)
    || (booking.counterpart_name && String(booking.counterpart_name).toLowerCase().includes('elena'))
  ));

  let totalGross = 0;
  let onlineReceived = 0;
  let cashPending = 0;
  let cashCollected = 0;

  const ledger = [];

  for (const booking of matchingBookings) {
    const amount = Number(booking.total_amount) || 0;
    totalGross += amount;

    const method = booking.payment_method || 'cash';
    const isPaid = booking.payment_status === 'paid';

    if (method === 'cash') {
      if (isPaid) {
        cashCollected += amount;
        ledger.push({
          id: `ledg-${booking.id}`,
          bookingId: booking.id,
          serviceTitle: booking.service_title,
          customerName: booking.customer_name || booking.counterpart_name || 'Customer',
          amount,
          method: 'cash',
          methodLabel: 'Cash on Service (COD)',
          status: 'Collected in Person',
          date: booking.updated_at || booking.created_at,
          transactionId: booking.transaction_id || `COD-${String(booking.id).slice(-6)}`,
        });
      } else {
        cashPending += amount;
        ledger.push({
          id: `ledg-${booking.id}`,
          bookingId: booking.id,
          serviceTitle: booking.service_title,
          customerName: booking.customer_name || booking.counterpart_name || 'Customer',
          amount,
          method: 'cash',
          methodLabel: 'Cash on Service (COD)',
          status: 'Pending Collection on Site',
          date: booking.created_at,
          transactionId: 'COD-PENDING',
        });
      }
    } else {
      onlineReceived += amount;
      ledger.push({
        id: `ledg-${booking.id}`,
        bookingId: booking.id,
        serviceTitle: booking.service_title,
        customerName: booking.customer_name || booking.counterpart_name || 'Customer',
        amount,
        method,
        methodLabel: method === 'upi'
          ? 'UPI Instant Transfer'
          : method === 'netbanking'
            ? 'Net Banking Transfer'
            : 'Online Gateway',
        status: 'Credited to Provider Balance',
        date: booking.paid_at || booking.created_at,
        transactionId: booking.transaction_id || `TXN-${method.toUpperCase()}-${String(booking.id).slice(-6)}`,
        bankOrUpi: booking.payment_bank || booking.payment_upi || '',
      });
    }
  }

  return {
    totalGross,
    onlineReceived,
    cashPending,
    cashCollected,
    totalBookingsCount: matchingBookings.length,
    ledger,
  };
};
