import { createServer } from 'node:http';
import { Buffer } from 'node:buffer';
import { randomBytes, scryptSync, timingSafeEqual, randomUUID } from 'node:crypto';
import process from 'node:process';
import { database, transaction } from './database.js';

const port = Number(process.env.API_PORT || 3001);
const sessions = new Map();
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

const currentUser = (request) => {
  const token = request.headers.authorization?.replace(/^Bearer\s+/i, '');
  const id = token && sessions.get(token);
  return id ? database.prepare('SELECT id, email, role, name, phone, address, created_at FROM users WHERE id = ?').get(id) : null;
};

const publicService = (service) => ({ ...service, verified: Boolean(service.verified) });

const createSession = (user) => {
  const token = randomBytes(32).toString('hex');
  sessions.set(token, user.id);
  return { token, user: database.prepare('SELECT id, email, role, name, phone, address, created_at FROM users WHERE id = ?').get(user.id) };
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

  if (request.method === 'POST' && pathname === '/api/auth/register') {
    const body = await readBody(request);
    const name = requiredString(body.name, 'Name', 100);
    const email = requiredString(body.email, 'Email', 254).toLowerCase();
    const phone = requiredString(body.phone, 'Phone', 30);
    const password = requiredString(body.password, 'Password', 200);
    const address = requiredString(body.address, 'Address', 500);
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new HttpError(400, 'Enter a valid email address.');
    if (password.length < 8) throw new HttpError(400, 'Password must contain at least 8 characters.');
    if (!['customer', 'provider'].includes(body.role)) throw new HttpError(400, 'Choose customer or provider account type.');

    const id = randomUUID();
    const salt = randomBytes(16).toString('hex');
    const passwordHash = scryptSync(password, salt, 64).toString('hex');
    const createAccount = () => transaction(() => {
      database.prepare(`
        INSERT INTO users (id, email, password_hash, password_salt, role, name, phone, address, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(id, email, passwordHash, salt, body.role, name, phone, address, new Date().toISOString());
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
        database.prepare(`
          INSERT INTO provider_profiles (user_id, business_name, category_id, description, service_area, hourly_rate)
          VALUES (?, ?, ?, ?, ?, ?)
        `).run(id, businessName, categoryId, description, serviceArea, hourlyRate);
        database.prepare(`
          INSERT INTO services (provider_id, provider_name, category_id, category_name, title, description, price_per_hour, service_area, rating, review_count, avatar, verified)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, 0, '', 0)
        `).run(id, businessName, categoryId, categoryName, businessName, description, hourlyRate, serviceArea);
      }
    });
    try {
      createAccount();
    } catch (error) {
      if (error.errcode === 2067) {
        return send(response, 409, { error: 'An account with that email already exists.' });
      }
      throw error;
    }
    return send(response, 201, createSession({ id }));
  }

  if (request.method === 'POST' && pathname === '/api/auth/login') {
    const body = await readBody(request);
    const email = requiredString(body.email, 'Email', 254).toLowerCase();
    const password = requiredString(body.password, 'Password', 200);
    const user = database.prepare('SELECT id, email, password_hash, password_salt FROM users WHERE email = ?').get(email);
    if (!user) return send(response, 401, { error: 'Email or password is incorrect.' });
    const submittedHash = scryptSync(password, user.password_salt, 64);
    const savedHash = Buffer.from(user.password_hash, 'hex');
    if (!timingSafeEqual(submittedHash, savedHash)) {
      return send(response, 401, { error: 'Email or password is incorrect.' });
    }
    return send(response, 200, createSession(user));
  }

  if (request.method === 'POST' && pathname === '/api/auth/logout') {
    const token = request.headers.authorization?.replace(/^Bearer\s+/i, '');
    if (token) sessions.delete(token);
    return send(response, 200, { message: 'Signed out.' });
  }

  if (request.method === 'GET' && pathname === '/api/auth/me') {
    const user = currentUser(request);
    return user ? send(response, 200, { user }) : send(response, 401, { error: 'Please sign in again.' });
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
      WHERE s.provider_id = ?
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
      SELECT b.id, b.customer_id, s.provider_id, s.provider_name, u.name AS customer_name
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
    if (body.paymentMethod !== 'cash') throw new HttpError(400, 'Only cash after service is currently available.');
    const service = database.prepare('SELECT * FROM services WHERE id = ?').get(serviceId);
    if (!service) return send(response, 404, { error: 'That service is no longer available.' });
    const id = randomUUID();
    const paymentId = randomUUID();
    const totalAmount = Math.round(service.price_per_hour * hours * 100) / 100;
    const createBooking = () => transaction(() => {
      database.prepare(`
        INSERT INTO bookings (id, customer_id, service_id, appointment_at, address, notes, hours, total_amount, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(id, user.id, serviceId, appointment.toISOString(), address, notes, hours, totalAmount, new Date().toISOString());
      database.prepare(`
        INSERT INTO payments (id, booking_id, amount, payment_method, status, created_at)
        VALUES (?, ?, ?, 'cash', 'pending', ?)
      `).run(paymentId, id, totalAmount, new Date().toISOString());
    });
    createBooking();
    return send(response, 201, {
      booking: {
        id, customer_id: user.id, service_id: serviceId, service_title: service.title,
        provider_name: service.provider_name, category_name: service.category_name,
        appointment_at: appointment.toISOString(), address, notes, hours, total_amount: totalAmount,
        status: 'confirmed', payment_id: paymentId, payment_method: 'cash', payment_status: 'pending', currency: 'INR',
      },
    });
  }

  return send(response, 404, { error: 'API endpoint not found.' });
};

const server = createServer((request, response) => {
  handle(request, response).catch((error) => {
    console.error(`${request.method} ${request.url}:`, error);
    send(response, error instanceof HttpError ? error.status : 500, {
      error: error instanceof HttpError ? error.message : 'The server could not complete the request.',
    });
  });
});

server.listen(port, '127.0.0.1', () => {
  console.log(`ServiceNest API listening on http://127.0.0.1:${port}`);
});

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => server.close(() => {
    database.close();
    process.exit(0);
  }));
}
