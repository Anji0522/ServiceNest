import { Buffer } from 'node:buffer';
import { createHash, createHmac, randomBytes, scryptSync, timingSafeEqual, randomUUID } from 'node:crypto';
import process from 'node:process';
import bcrypt from 'bcryptjs';
import express from 'express';
import jwt from 'jsonwebtoken';
import Razorpay from 'razorpay';
import { database, transaction } from './database.js';

const port = Number(process.env.PORT || process.env.API_PORT || 3001);
const host = process.env.HOST || '127.0.0.1';
const jwtSecret = process.env.JWT_SECRET || (process.env.NODE_ENV === 'production' ? '' : randomBytes(32).toString('hex'));
if (Buffer.byteLength(jwtSecret) < 32) {
  throw new Error('JWT_SECRET must contain at least 32 bytes.');
}
const passwordHashRounds = 10;
const razorpayKeyId = process.env.RAZORPAY_KEY_ID || '';
const razorpayKeySecret = process.env.RAZORPAY_KEY_SECRET || '';
const razorpayWebhookSecret = process.env.RAZORPAY_WEBHOOK_SECRET || '';
const razorpay = razorpayKeyId && razorpayKeySecret
  ? new Razorpay({ key_id: razorpayKeyId, key_secret: razorpayKeySecret })
  : null;
const allowedOrigins = new Set(
  (process.env.CORS_ORIGINS || 'http://localhost:5173,http://127.0.0.1:5173,http://localhost:5174,http://127.0.0.1:5174,http://localhost:4173,http://127.0.0.1:4173,http://localhost:4174,http://127.0.0.1:4174')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean),
);
const categories = new Map([
  [1, 'Electrician'], [2, 'Plumber'], [3, 'AC Repair'],
  [4, 'Cleaning'], [5, 'Carpentry'], [6, 'Painting'],
]);

class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

const send = (response, status, data) => {
  response.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
  });
  response.end(JSON.stringify(data));
};

const readBody = (request) => new Promise((resolve, reject) => {
  if (request.body !== undefined || request.readableEnded) {
    const parsed = request.body === undefined ? {} : request.body;
    if (parsed === null || Array.isArray(parsed) || typeof parsed !== 'object') {
      reject(new HttpError(400, 'Request body must be a JSON object.'));
      return;
    }
    resolve(parsed);
    return;
  }
  let body = '';
  let tooLarge = false;
  request.on('data', (chunk) => {
    if (tooLarge) return;
    body += chunk;
    if (body.length > 1_000_000) {
      tooLarge = true;
      reject(new HttpError(413, 'Request body is too large.'));
      request.resume();
    }
  });
  request.on('end', () => {
    if (tooLarge) return;
    let parsed;
    try {
      parsed = JSON.parse(body || '{}');
    } catch {
      reject(new HttpError(400, 'Request body must be valid JSON.'));
      return;
    }
    if (parsed === null || Array.isArray(parsed) || typeof parsed !== 'object') {
      reject(new HttpError(400, 'Request body must be a JSON object.'));
      return;
    }
    resolve(parsed);
  });
  request.on('error', reject);
});

const requiredString = (value, label, maxLength = 300) => {
  if (typeof value !== 'string' || !value.trim() || value.trim().length > maxLength) {
    throw new HttpError(400, `${label} is required and must be no longer than ${maxLength} characters.`);
  }
  return value.trim();
};

const hashToken = (token) => createHash('sha256').update(token).digest('hex');
const findUserByPhone = (phone) => database.prepare(`
  SELECT 1 FROM users
  WHERE replace(replace(replace(replace(replace(phone, ' ', ''), '-', ''), '(', ''), ')', ''), '.', '') = ?
`).get(phone);

const currentUser = (request) => {
  const token = request.headers.authorization?.match(/^Bearer\s+(\S+)$/i)?.[1];
  if (!token) return null;
  try {
    const claims = jwt.verify(token, jwtSecret, { algorithms: ['HS256'] });
    if (typeof claims === 'string' || !claims.sub) return null;
    const user = database.prepare(`
      SELECT u.id, u.email, u.role, u.name, u.phone, u.address, u.created_at
      FROM sessions s
      JOIN users u ON u.id = s.user_id
      WHERE s.token_hash = ? AND s.user_id = ? AND s.expires_at > ?
    `).get(hashToken(token), claims.sub, new Date().toISOString()) || null;
    return user && (!claims.role || claims.role === user.role) ? user : null;
  } catch {
    return null;
  }
};

const publicService = (service) => ({ ...service, verified: Boolean(service.verified) });

const createSession = (user) => {
  const profile = database.prepare('SELECT id, email, role, name, phone, address, created_at FROM users WHERE id = ?').get(user.id);
  const token = jwt.sign({ userId: profile.id, role: profile.role }, jwtSecret, {
    algorithm: 'HS256',
    subject: user.id,
    jwtid: randomUUID(),
    expiresIn: '30d',
  });
  const createdAt = new Date();
  const expiresAt = new Date(createdAt.getTime() + 30 * 24 * 60 * 60 * 1000);
  database.prepare('DELETE FROM sessions WHERE expires_at <= ?').run(createdAt.toISOString());
  database.prepare(`
    INSERT INTO sessions (token_hash, user_id, created_at, expires_at)
    VALUES (?, ?, ?, ?)
  `).run(hashToken(token), user.id, createdAt.toISOString(), expiresAt.toISOString());
  if (profile.role === 'provider') {
    profile.providerProfile = database.prepare(`
      SELECT business_name, category_id, description, service_area, hourly_rate
      FROM provider_profiles WHERE user_id = ?
    `).get(user.id);
  }
  return { token, user: profile };
};

const compareSignature = (expected, provided) => {
  if (!/^[a-f\d]+$/i.test(provided || '') || expected.length !== provided.length) return false;
  return timingSafeEqual(Buffer.from(expected, 'hex'), Buffer.from(provided, 'hex'));
};

const confirmPayment = (payment, paymentId, status) => transaction(() => {
  const existing = database.prepare('SELECT * FROM payments WHERE id = ?').get(payment.id);
  if (!existing) throw new HttpError(404, 'Payment record not found.');
  if (existing.status === 'paid' && status !== 'paid') return;
  database.prepare(`
    UPDATE payments
    SET status = ?, razorpay_payment_id = COALESCE(razorpay_payment_id, ?), updated_at = ?
    WHERE id = ?
  `).run(status, paymentId || null, new Date().toISOString(), payment.id);
  database.prepare(`
    UPDATE bookings
    SET payment_status = ?,
      status = CASE
        WHEN ? = 'paid' AND status IN ('pending', 'cancelled') THEN 'accepted'
        WHEN ? = 'failed' AND status = 'pending' THEN 'cancelled'
        ELSE status
      END,
      updated_at = ?
    WHERE id = ?
  `).run(status, status, status, new Date().toISOString(), payment.booking_id);
});

const createRazorpayOrder = async (paymentId, bookingId, idempotencyKey, customerId, amount) => {
  let order;
  try {
    order = await razorpay.orders.create({
      amount: Math.round(amount * 100),
      currency: 'INR',
      receipt: idempotencyKey.slice(0, 40),
      notes: { booking_id: bookingId, customer_id: customerId },
    });
  } catch (error) {
    console.error('Razorpay order creation failed:', error);
    transaction(() => {
      database.prepare(`
        UPDATE payments SET status = 'failed', updated_at = ? WHERE id = ? AND razorpay_order_id IS NULL
      `).run(new Date().toISOString(), paymentId);
      database.prepare(`
        UPDATE bookings SET payment_status = 'failed', updated_at = ? WHERE id = ?
      `).run(new Date().toISOString(), bookingId);
    });
    throw new HttpError(502, 'Could not create a payment order. Retry this booking using the same idempotency key.');
  }
  transaction(() => {
    database.prepare(`
      UPDATE payments SET razorpay_order_id = ?, status = 'pending', updated_at = ? WHERE id = ?
    `).run(order.id, new Date().toISOString(), paymentId);
    database.prepare(`
      UPDATE bookings SET payment_status = 'pending', updated_at = ? WHERE id = ?
    `).run(new Date().toISOString(), bookingId);
  });
  return order;
};

const handleRazorpayWebhook = (request, response) => {
  if (!razorpayWebhookSecret) throw new HttpError(503, 'Payment webhooks are not configured.');
  if (!Buffer.isBuffer(request.body)) throw new HttpError(400, 'Webhook payload must be raw JSON.');
  const signature = request.headers['x-razorpay-signature'];
  const expected = createHmac('sha256', razorpayWebhookSecret).update(request.body).digest('hex');
  if (!compareSignature(expected, signature)) throw new HttpError(401, 'Invalid payment webhook signature.');

  let event;
  try {
    event = JSON.parse(request.body.toString('utf8'));
  } catch {
    throw new HttpError(400, 'Webhook payload must be valid JSON.');
  }
  const eventId = request.headers['x-razorpay-event-id']
    || createHash('sha256').update(request.body).digest('hex');
  const paymentEntity = event.payload?.payment?.entity;
  const recognized = event.event === 'payment.captured' || event.event === 'payment.failed';
  if (!recognized || !paymentEntity?.order_id || !paymentEntity?.id) {
    return send(response, 200, { received: true, ignored: true });
  }

  transaction(() => {
    const inserted = database.prepare(`
      INSERT OR IGNORE INTO payment_webhook_events (event_id, event_type, received_at)
      VALUES (?, ?, ?)
    `).run(eventId, event.event, new Date().toISOString());
    if (inserted.changes === 0) return;

    const payment = database.prepare('SELECT * FROM payments WHERE razorpay_order_id = ?').get(paymentEntity.order_id);
    if (!payment) return;
    const paid = event.event === 'payment.captured';
    if (paid && (Number(paymentEntity.amount) !== Math.round(payment.amount * 100)
      || paymentEntity.currency !== payment.currency)) {
      throw new HttpError(400, 'Payment amount does not match the booking total.');
    }
    if (payment.status === 'paid' && !paid) return;
    const status = paid ? 'paid' : 'failed';
    database.prepare(`
      UPDATE payments
      SET status = ?, razorpay_payment_id = ?, updated_at = ?
      WHERE id = ?
    `).run(status, paymentEntity.id, new Date().toISOString(), payment.id);
    database.prepare(`
      UPDATE bookings
      SET payment_status = ?,
        status = CASE
          WHEN ? = 'paid' AND status IN ('pending', 'cancelled') THEN 'accepted'
          WHEN ? = 'failed' AND status = 'pending' THEN 'cancelled'
          ELSE status
        END,
        updated_at = ?
      WHERE id = ?
    `).run(status, status, status, new Date().toISOString(), payment.booking_id);
  });
  return send(response, 200, { received: true });
};

const handlePaymentVerification = async (request, response) => {
  const user = currentUser(request);
  if (!user) throw new HttpError(401, 'Sign in to verify this payment.');
  if (!razorpay) throw new HttpError(503, 'Online payments are not configured.');
  const body = await readBody(request);
  const orderId = requiredString(body.razorpay_order_id, 'Payment order', 100);
  const paymentId = requiredString(body.razorpay_payment_id, 'Payment reference', 100);
  const signature = requiredString(body.razorpay_signature, 'Payment signature', 256);
  const payment = database.prepare(`
    SELECT p.* FROM payments p
    JOIN bookings b ON b.id = p.booking_id
    WHERE p.razorpay_order_id = ? AND b.customer_id = ?
  `).get(orderId, user.id);
  if (!payment) throw new HttpError(404, 'Payment order not found for this account.');
  const expected = createHmac('sha256', razorpayKeySecret).update(`${orderId}|${paymentId}`).digest('hex');
  if (!compareSignature(expected, signature)) throw new HttpError(400, 'Payment signature is invalid.');
  if (payment.status !== 'paid') confirmPayment(payment, paymentId, 'paid');
  return send(response, 200, { success: true, paymentStatus: 'paid' });
};

const handleRegistration = async (request, response) => {
  try {
    const body = await readBody(request);
    const name = requiredString(body.name, 'Name', 100);
    const email = requiredString(body.email, 'Email', 254).toLowerCase();
    const phone = requiredString(body.phone, 'Phone', 30).replace(/[\s().-]/g, '');
    const password = requiredString(body.password, 'Password', 200);
    const address = typeof body.address === 'string' ? body.address.trim().slice(0, 500) : '';
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      throw new HttpError(400, 'Enter a valid email address.');
    }
    if (!/^\+?[1-9]\d{7,14}$/.test(phone)) {
      throw new HttpError(400, 'Enter a valid phone number with 8 to 15 digits.');
    }
    if (password.length < 8 || Buffer.byteLength(password, 'utf8') > 72) {
      throw new HttpError(400, 'Password must contain 8 to 72 UTF-8 bytes.');
    }
    if (body.role !== 'customer' && body.role !== 'provider') {
      throw new HttpError(400, 'Choose customer or provider account type.');
    }

    let provider;
    if (body.role === 'provider') {
      const categoryId = Number(body.categoryId);
      const categoryName = categories.get(categoryId);
      const businessName = requiredString(body.businessName, 'Business name', 100);
      const description = requiredString(body.description, 'Service description', 1000);
      const serviceArea = requiredString(body.serviceArea, 'Service area', 200);
      const hourlyRate = Number(body.hourlyRate);
      if (!categoryName || !Number.isFinite(hourlyRate) || hourlyRate <= 0 || hourlyRate > 100000) {
        throw new HttpError(400, 'Choose a valid service category and hourly rate.');
      }
      provider = { categoryId, categoryName, businessName, description, serviceArea, hourlyRate };
    }

    if (database.prepare('SELECT 1 FROM users WHERE email = ?').get(email)) {
      throw new HttpError(409, 'An account with that email already exists.');
    }
    if (findUserByPhone(phone)) {
      throw new HttpError(409, 'An account with that phone number already exists.');
    }

    const id = randomUUID();
    const passwordHash = await bcrypt.hash(password, passwordHashRounds);

    transaction(() => {
      if (database.prepare('SELECT 1 FROM users WHERE email = ?').get(email)) {
        throw new HttpError(409, 'An account with that email already exists.');
      }
      if (findUserByPhone(phone)) {
        throw new HttpError(409, 'An account with that phone number already exists.');
      }

      database.prepare(`
        INSERT INTO users (id, email, password_hash, password_salt, role, name, phone, address, created_at)
        VALUES (?, ?, ?, '', ?, ?, ?, ?, ?)
      `).run(id, email, passwordHash, body.role, name, phone, address, new Date().toISOString());

      if (provider) {
        database.prepare(`
          INSERT INTO provider_profiles (user_id, business_name, category_id, description, service_area, hourly_rate)
          VALUES (?, ?, ?, ?, ?, ?)
        `).run(
          id,
          provider.businessName,
          provider.categoryId,
          provider.description,
          provider.serviceArea,
          provider.hourlyRate,
        );
        database.prepare(`
          INSERT INTO services (
            provider_id, provider_name, category_id, category_name, title, description,
            price_per_hour, service_area, rating, review_count, avatar, verified
          )
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, 0, '', 0)
        `).run(
          id,
          provider.businessName,
          provider.categoryId,
          provider.categoryName,
          provider.businessName,
          provider.description,
          provider.hourlyRate,
          provider.serviceArea,
        );
      }
    });

    return send(response, 201, createSession({ id }));
  } catch (error) {
    if (error.errcode === 2067 || error.code === 'SQLITE_CONSTRAINT_UNIQUE') {
      const message = error.message.includes('users.phone')
        ? 'An account with that phone number already exists.'
        : error.message.includes('users.email')
          ? 'An account with that email already exists.'
          : 'An account with that email or phone number already exists.';
      return send(response, 409, { success: false, message });
    }

    return sendError(error, request, response);
  }
};

const handleLogin = async (request, response) => {
  const body = await readBody(request);
  const email = requiredString(body.email, 'Email', 254).toLowerCase();
  const password = requiredString(body.password, 'Password', 200);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new HttpError(400, 'Enter a valid email address.');
  const user = database.prepare(`
    SELECT id, email, role, password_hash, password_salt
    FROM users WHERE email = ?
  `).get(email);
  if (!user) throw new HttpError(401, 'Email or password is incorrect.');

  const isBcryptHash = /^\$2[aby]\$/.test(user.password_hash);
  const passwordMatches = isBcryptHash
    ? await bcrypt.compare(password, user.password_hash)
    : (() => {
      const submittedHash = scryptSync(password, user.password_salt, 64);
      const savedHash = Buffer.from(user.password_hash, 'hex');
      return submittedHash.length === savedHash.length && timingSafeEqual(submittedHash, savedHash);
    })();
  if (!passwordMatches) throw new HttpError(401, 'Email or password is incorrect.');
  if (!isBcryptHash && Buffer.byteLength(password, 'utf8') <= 72) {
    const passwordHash = await bcrypt.hash(password, passwordHashRounds);
    database.prepare('UPDATE users SET password_hash = ?, password_salt = ? WHERE id = ?')
      .run(passwordHash, '', user.id);
  }
  return send(response, 200, createSession(user));
};

const handle = async (request, response) => {
  const url = new URL(request.url, `http://${request.headers.host || 'localhost'}`);
  const { pathname } = url;

  if (request.method === 'GET' && pathname === '/api/health') {
    return send(response, 200, { status: 'ok' });
  }

  if (request.method === 'GET' && pathname === '/api/services') {
    const category = Number(url.searchParams.get('category') || 0);
    const search = (url.searchParams.get('search') || '').trim().toLowerCase();
    const services = database.prepare('SELECT * FROM services ORDER BY id').all()
      .filter((service) => (!category || service.category_id === category)
        && (!search || [service.title, service.description, service.provider_name, service.category_name, service.service_area]
          .some((value) => value.toLowerCase().includes(search))))
      .map(publicService);
    return send(response, 200, { services });
  }

  if (request.method === 'GET' && pathname === '/api/bookings/my-history') {
    try {
      const user = currentUser(request);
      if (!user) return send(response, 401, { success: false, message: 'Sign in to view booking history.' });
      if (user.role !== 'customer' && user.role !== 'provider') {
        return send(response, 403, { success: false, message: 'A customer or provider account is required.' });
      }

      const isCustomer = user.role === 'customer';
      const userColumn = isCustomer ? 'customer_id' : 'provider_id';
      const counterpartJoin = isCustomer
        ? 'LEFT JOIN users counterpart ON counterpart.id = b.provider_id'
        : 'JOIN users counterpart ON counterpart.id = b.customer_id';
      const bookings = database.prepare(`
        SELECT b.id, b.customer_id, b.provider_id, b.service_id, b.status, b.payment_status,
          b.total_amount, b.scheduled_date, b.appointment_at, b.created_at, b.updated_at,
          s.title AS service_title, s.category_name, s.provider_name,
          CASE WHEN ? = 'customer' THEN COALESCE(counterpart.name, s.provider_name)
               ELSE counterpart.name END AS counterpart_name,
          counterpart.phone AS counterpart_phone,
          counterpart.email AS counterpart_email,
          CASE WHEN ? = 'provider' THEN counterpart.address ELSE NULL END AS customer_address
        FROM bookings b
        JOIN services s ON s.id = b.service_id
        ${counterpartJoin}
        WHERE b.${userColumn} = ?
        ORDER BY b.scheduled_date DESC
      `).all(user.role, user.role, user.id);
      return send(response, 200, { bookings, role: user.role });
    } catch (error) {
      return sendError(error, request, response);
    }
  }

  if (request.method === 'GET' && pathname === '/api/provider/profile') {
    const user = currentUser(request);
    if (!user) return send(response, 401, { error: 'Sign in to view your provider profile.' });
    if (user.role !== 'provider') return send(response, 403, { error: 'A provider account is required.' });
    const profile = database.prepare('SELECT * FROM provider_profiles WHERE user_id = ?').get(user.id);
    return send(response, 200, { profile });
  }

  if (request.method === 'GET' && pathname === '/api/provider/services') {
    const user = currentUser(request);
    if (!user) return send(response, 401, { error: 'Sign in to view your provider listings.' });
    if (user.role !== 'provider') return send(response, 403, { error: 'A provider account is required.' });
    const services = database.prepare('SELECT * FROM services WHERE provider_id = ? ORDER BY id DESC').all(user.id);
    return send(response, 200, { services: services.map(publicService) });
  }

  if (request.method === 'POST' && pathname === '/api/provider/services') {
    const user = currentUser(request);
    if (!user) return send(response, 401, { error: 'Sign in to publish a service.' });
    if (user.role !== 'provider') return send(response, 403, { error: 'A provider account is required.' });
    const body = await readBody(request);
    const categoryId = Number(body.categoryId);
    const categoryName = categories.get(categoryId);
    const title = requiredString(body.title, 'Service title', 120);
    const description = requiredString(body.description, 'Description', 1000);
    const serviceArea = requiredString(body.serviceArea, 'Service area', 200);
    const hourlyRate = Number(body.hourlyRate);
    if (!categoryName || !Number.isFinite(hourlyRate) || hourlyRate <= 0 || hourlyRate > 100000) {
      throw new HttpError(400, 'Choose a valid service category and hourly rate.');
    }
    const profile = database.prepare('SELECT business_name FROM provider_profiles WHERE user_id = ?').get(user.id);
    const result = database.prepare(`
      INSERT INTO services (provider_id, provider_name, category_id, category_name, title, description, price_per_hour, service_area)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(user.id, profile.business_name, categoryId, categoryName, title, description, hourlyRate, serviceArea);
    const service = database.prepare('SELECT * FROM services WHERE id = ?').get(Number(result.lastInsertRowid));
    return send(response, 201, { service: publicService(service) });
  }

  if (request.method === 'GET' && pathname === '/api/bookings') {
    const user = currentUser(request);
    if (!user) return send(response, 401, { error: 'Sign in to view bookings.' });
    if (user.role !== 'customer') return send(response, 403, { error: 'Use a customer account to view customer bookings.' });
    const bookings = database.prepare(`
      SELECT b.*, s.title AS service_title, s.provider_name, s.category_name,
        p.id AS payment_id, p.payment_method, p.payment_status, p.currency
      FROM bookings b
      JOIN services s ON s.id = b.service_id
      LEFT JOIN (
        SELECT id, booking_id, payment_method, status AS payment_status, currency FROM payments
      ) p ON p.booking_id = b.id
      WHERE b.customer_id = ?
      ORDER BY b.created_at DESC
    `).all(user.id);
    return send(response, 200, { bookings });
  }

  if (request.method === 'GET' && pathname === '/api/provider/bookings') {
    const user = currentUser(request);
    if (!user) return send(response, 401, { error: 'Sign in to view service requests.' });
    if (user.role !== 'provider') return send(response, 403, { error: 'A provider account is required.' });
    const bookings = database.prepare(`
      SELECT b.*, s.title AS service_title, s.category_name,
        u.name AS customer_name, u.phone AS customer_phone, u.email AS customer_email,
        p.payment_method, p.status AS payment_status, p.currency
      FROM bookings b
      JOIN services s ON s.id = b.service_id
      JOIN users u ON u.id = b.customer_id
      LEFT JOIN payments p ON p.booking_id = b.id
      WHERE b.provider_id = ?
      ORDER BY b.created_at DESC
    `).all(user.id);
    return send(response, 200, { bookings });
  }

  const bookingMessagesMatch = pathname.match(/^\/api\/bookings\/([^/]+)\/messages$/);
  if (bookingMessagesMatch && ['GET', 'POST'].includes(request.method)) {
    const user = currentUser(request);
    if (!user) return send(response, 401, { error: 'Sign in to message about this booking.' });
    const bookingId = bookingMessagesMatch[1];
    const booking = database.prepare(`
      SELECT b.id, b.customer_id, b.provider_id, s.provider_name, u.name AS customer_name
      FROM bookings b
      JOIN services s ON s.id = b.service_id
      JOIN users u ON u.id = b.customer_id
      WHERE b.id = ?
    `).get(bookingId);
    if (!booking) return send(response, 404, { error: 'Booking not found.' });
    if (user.id !== booking.customer_id && user.id !== booking.provider_id) {
      return send(response, 403, { error: 'Only this booking’s customer and provider can read or send messages.' });
    }

    if (request.method === 'GET') {
      const messages = database.prepare(`
        SELECT m.id, m.body, m.created_at, m.sender_id, u.name AS sender_name
        FROM booking_messages m
        JOIN users u ON u.id = m.sender_id
        WHERE m.booking_id = ?
        ORDER BY m.created_at, m.id
      `).all(bookingId);
      return send(response, 200, { messages });
    }

    const body = await readBody(request);
    const messageBody = requiredString(body.body, 'Message', 2000);
    const id = randomUUID();
    const createdAt = new Date().toISOString();
    database.prepare(`
      INSERT INTO booking_messages (id, booking_id, sender_id, body, created_at)
      VALUES (?, ?, ?, ?, ?)
    `).run(id, bookingId, user.id, messageBody, createdAt);
    return send(response, 201, {
      message: { id, booking_id: bookingId, sender_id: user.id, sender_name: user.name, body: messageBody, created_at: createdAt },
    });
  }

  if (request.method === 'POST' && pathname === '/api/bookings') {
    const user = currentUser(request);
    if (!user) return send(response, 401, { error: 'Sign in before booking a service.' });
    if (user.role !== 'customer') return send(response, 403, { error: 'Use a customer account to create a booking.' });
    const body = await readBody(request);
    const serviceId = Number(body.serviceId);
    const hours = Number(body.hours);
    const appointmentAt = requiredString(body.appointmentAt, 'Appointment time', 40);
    const address = requiredString(body.address, 'Service address', 500);
    const notes = typeof body.notes === 'string' ? body.notes.trim().slice(0, 1000) : '';
    if (!Number.isInteger(serviceId) || !Number.isFinite(hours) || hours <= 0 || hours > 24) {
      throw new HttpError(400, 'Choose a valid service and a duration between 1 and 24 hours.');
    }
    const appointment = new Date(appointmentAt);
    if (Number.isNaN(appointment.getTime()) || appointment <= new Date()) {
      throw new HttpError(400, 'Choose an appointment time in the future.');
    }
    const paymentMethod = body.paymentMethod || 'cash';
    if (!['cash', 'razorpay'].includes(paymentMethod)) {
      throw new HttpError(400, 'Choose cash or Razorpay as the payment method.');
    }
    if (paymentMethod === 'razorpay' && !razorpay) {
      throw new HttpError(503, 'Online payments are not configured yet. Choose cash after service or try again later.');
    }
    const idempotencyKey = request.headers['idempotency-key'] || body.idempotencyKey;
    if (typeof idempotencyKey !== 'string' || !/^[a-z\d_-]{8,40}$/i.test(idempotencyKey)) {
      throw new HttpError(400, 'A valid Idempotency-Key header is required for booking.');
    }
    const service = database.prepare('SELECT * FROM services WHERE id = ?').get(serviceId);
    if (!service) return send(response, 404, { error: 'That service is no longer available.' });
    const existing = database.prepare(`
      SELECT b.*, s.title AS service_title, s.provider_name, s.category_name,
        p.id AS payment_id, p.payment_method, p.status AS payment_status, p.currency,
        p.razorpay_order_id, p.updated_at AS payment_updated_at
      FROM bookings b
      JOIN services s ON s.id = b.service_id
      JOIN payments p ON p.booking_id = b.id
      WHERE b.customer_id = ? AND b.idempotency_key = ?
    `).get(user.id, idempotencyKey);
    if (existing) {
      if (existing.service_id !== serviceId
        || existing.appointment_at !== appointment.toISOString()
        || existing.hours !== hours
        || existing.address !== address
        || existing.notes !== notes
        || existing.payment_method !== paymentMethod) {
        throw new HttpError(409, 'This idempotency key already belongs to a different booking request. Review your booking history before starting another booking.');
      }
      if (existing.payment_method === 'razorpay' && !existing.razorpay_order_id) {
        const retryCutoff = new Date(Date.now() - 60_000).toISOString();
        const recentPendingAttempt = existing.payment_status === 'pending'
          && existing.payment_updated_at
          && existing.payment_updated_at > retryCutoff;
        if (recentPendingAttempt) {
          throw new HttpError(409, 'Payment order creation is still being reconciled. Retry with the same idempotency key shortly.');
        }
        const now = new Date().toISOString();
        const claimed = transaction(() => database.prepare(`
          UPDATE payments SET status = 'pending', updated_at = ?
          WHERE id = ? AND status = ? AND razorpay_order_id IS NULL
            AND (status = 'failed' OR updated_at IS NULL OR updated_at <= ?)
        `).run(now, existing.payment_id, existing.payment_status, retryCutoff));
        if (!claimed.changes) {
          throw new HttpError(409, 'Payment order creation is already being retried. Retry with the same idempotency key shortly.');
        }
        transaction(() => {
          database.prepare("UPDATE bookings SET payment_status = 'pending', updated_at = ? WHERE id = ?")
            .run(now, existing.id);
        });
        const order = await createRazorpayOrder(
          existing.payment_id,
          existing.id,
          idempotencyKey,
          user.id,
          existing.total_amount,
        );
        existing.payment_status = 'pending';
        return send(response, 200, {
          booking: existing,
          razorpay: { keyId: razorpayKeyId, orderId: order.id, amount: order.amount, currency: order.currency },
        });
      }
      if (existing.payment_status === 'paid') return send(response, 200, { booking: existing });
      return send(response, 200, {
        booking: existing,
        ...(existing.razorpay_order_id ? {
          razorpay: {
            keyId: razorpayKeyId,
            orderId: existing.razorpay_order_id,
            amount: Math.round(existing.total_amount * 100),
            currency: 'INR',
          },
        } : {}),
      });
    }
    const id = randomUUID();
    const paymentId = randomUUID();
    const totalAmount = Math.round(service.price_per_hour * hours * 100) / 100;
    transaction(() => {
      database.prepare(`
        INSERT INTO bookings
          (id, customer_id, provider_id, service_id, appointment_at, scheduled_date, address, notes, hours, total_amount, status, payment_status, idempotency_key, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', 'pending', ?, ?)
      `).run(id, user.id, service.provider_id, serviceId, appointment.toISOString(), appointment.toISOString(), address, notes, hours, totalAmount, idempotencyKey, new Date().toISOString());
      database.prepare(`
        INSERT INTO payments (id, booking_id, amount, payment_method, status, idempotency_key, created_at, updated_at)
        VALUES (?, ?, ?, ?, 'pending', ?, ?, ?)
      `).run(paymentId, id, totalAmount, paymentMethod, idempotencyKey, new Date().toISOString(), new Date().toISOString());
    });
    if (paymentMethod === 'razorpay') {
      const order = await createRazorpayOrder(paymentId, id, idempotencyKey, user.id, totalAmount);
      return send(response, 201, {
        booking: {
          id, customer_id: user.id, provider_id: service.provider_id, service_id: serviceId,
          service_title: service.title, provider_name: service.provider_name,
          category_name: service.category_name, appointment_at: appointment.toISOString(),
          scheduled_date: appointment.toISOString(), address, notes, hours, total_amount: totalAmount,
          status: 'pending', payment_id: paymentId, payment_method: paymentMethod,
          payment_status: 'pending', currency: 'INR',
        },
        razorpay: { keyId: razorpayKeyId, orderId: order.id, amount: order.amount, currency: order.currency },
      });
    }
    return send(response, 201, {
      booking: {
        id, customer_id: user.id, provider_id: service.provider_id, service_id: serviceId, service_title: service.title,
        provider_name: service.provider_name, category_name: service.category_name,
        appointment_at: appointment.toISOString(), scheduled_date: appointment.toISOString(), address, notes, hours, total_amount: totalAmount,
        status: 'pending', payment_id: paymentId, payment_method: paymentMethod, payment_status: 'pending', currency: 'INR',
      },
    });
  }

  return send(response, 404, { error: 'API endpoint not found.' });
};

const sendError = (error, request, response) => {
  const status = error instanceof HttpError
    ? error.status
    : Number.isInteger(error.status) && error.status >= 400 && error.status < 500
      ? error.status
      : 500;
  const message = error instanceof HttpError
    ? error.message
    : error.type === 'entity.parse.failed'
      ? 'Request body must be valid JSON.'
      : status === 413
        ? 'Request body is too large.'
        : 'The server could not complete the request.';
  if (status >= 500) console.error(`${request.method} ${request.url}:`, error);
  send(response, status, { success: false, message, error: message });
};

const asyncHandler = (handler) => (request, response) => {
  Promise.resolve(handler(request, response)).catch((error) => sendError(error, request, response));
};

const app = express();
app.use((request, response, next) => {
  const origin = request.headers.origin;
  if (origin && !allowedOrigins.has(origin)) {
    return send(response, 403, { error: 'This website is not allowed to access the API.' });
  }
  if (origin) {
    response.setHeader('Access-Control-Allow-Origin', origin);
    response.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    response.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type, Idempotency-Key');
    response.setHeader('Vary', 'Origin');
  }
  if (request.method === 'OPTIONS') {
    response.writeHead(204);
    return response.end();
  }
  return next();
});
app.post('/api/webhooks/razorpay', express.raw({ type: 'application/json', limit: '1mb' }), asyncHandler(handleRazorpayWebhook));
app.use(express.json({ limit: '1mb' }));
app.post('/api/auth/register', asyncHandler(handleRegistration));
app.post('/api/auth/login', asyncHandler(handleLogin));
app.post('/api/payments/verify', asyncHandler(handlePaymentVerification));
app.post('/api/auth/logout', (request, response) => {
  const token = request.headers.authorization?.match(/^Bearer\s+(\S+)$/i)?.[1];
  if (token) database.prepare('DELETE FROM sessions WHERE token_hash = ?').run(hashToken(token));
  return send(response, 200, { message: 'Signed out.' });
});
app.get('/api/auth/me', (request, response) => {
  const user = currentUser(request);
  return user ? send(response, 200, { user }) : send(response, 401, { error: 'Please sign in again.' });
});
app.use(asyncHandler(handle));
app.use((error, request, response, next) => {
  if (response.headersSent) return next(error);
  return sendError(error, request, response);
});

const server = app.listen(port, host, () => {
  console.log(`ServiceNest API listening on port ${port}`);
});

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => server.close(() => {
    database.close();
    process.exit(0);
  }));
}
