import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';
import process from 'node:process';

const defaultDatabasePath = resolve(dirname(fileURLToPath(import.meta.url)), '../data/servicenest.sqlite');
const databasePath = resolve(process.env.SERVICENEST_DB_PATH || defaultDatabasePath);
mkdirSync(dirname(databasePath), { recursive: true });

export const database = new DatabaseSync(databasePath);
export const transaction = (callback) => {
  database.exec('BEGIN IMMEDIATE');
  try {
    const result = callback();
    database.exec('COMMIT');
    return result;
  } catch (error) {
    database.exec('ROLLBACK');
    throw error;
  }
};

database.exec(`
  PRAGMA foreign_keys = ON;
  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    email TEXT NOT NULL UNIQUE COLLATE NOCASE,
    password_hash TEXT NOT NULL,
    password_salt TEXT NOT NULL,
    role TEXT NOT NULL CHECK (role IN ('customer', 'provider')),
    name TEXT NOT NULL,
    phone TEXT NOT NULL,
    address TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS sessions (
    token_hash TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at TEXT NOT NULL,
    expires_at TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS sessions_expires_at ON sessions (expires_at);
  CREATE TABLE IF NOT EXISTS provider_profiles (
    user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    business_name TEXT NOT NULL,
    category_id INTEGER NOT NULL,
    description TEXT NOT NULL,
    service_area TEXT NOT NULL,
    hourly_rate REAL NOT NULL CHECK (hourly_rate > 0)
  );
  CREATE TABLE IF NOT EXISTS services (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    provider_id TEXT NOT NULL,
    provider_name TEXT NOT NULL,
    category_id INTEGER NOT NULL,
    category_name TEXT NOT NULL,
    title TEXT NOT NULL,
    description TEXT NOT NULL,
    price_per_hour REAL NOT NULL CHECK (price_per_hour > 0),
    service_area TEXT NOT NULL,
    rating REAL NOT NULL DEFAULT 0,
    review_count INTEGER NOT NULL DEFAULT 0,
    avatar TEXT NOT NULL DEFAULT '',
    verified INTEGER NOT NULL DEFAULT 0
  );
  CREATE TABLE IF NOT EXISTS bookings (
    id TEXT PRIMARY KEY,
    customer_id TEXT NOT NULL REFERENCES users(id),
    service_id INTEGER NOT NULL REFERENCES services(id),
    appointment_at TEXT NOT NULL,
    address TEXT NOT NULL,
    notes TEXT NOT NULL DEFAULT '',
    hours REAL NOT NULL CHECK (hours > 0),
    total_amount REAL NOT NULL,
    status TEXT NOT NULL DEFAULT 'confirmed',
    created_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS payments (
    id TEXT PRIMARY KEY,
    booking_id TEXT NOT NULL UNIQUE REFERENCES bookings(id),
    amount REAL NOT NULL,
    currency TEXT NOT NULL DEFAULT 'INR',
    payment_method TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending',
    created_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS booking_messages (
    id TEXT PRIMARY KEY,
    booking_id TEXT NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
    sender_id TEXT NOT NULL REFERENCES users(id),
    body TEXT NOT NULL,
    created_at TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS booking_messages_booking_created
    ON booking_messages (booking_id, created_at);
`);

database.prepare('DELETE FROM sessions WHERE expires_at <= ?').run(new Date().toISOString());

const seedServices = [
  [101, '1', 'David Miller', 1, 'Electrician', 'Complete Home Electrical Wiring & Inspection', 'Certified master electrician for switchboard fixes, short-circuit diagnostics, fixture upgrades, and full panel rewiring.', 45, 'Downtown & Metro East', 4.9, 38, 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150&auto=format&fit=crop&q=80', 1],
  [102, '2', 'Marcus Vance', 2, 'Plumber', 'Emergency Leak Detection & Pipe Repair', 'Quick response pipe patching, drain unblocking, faucet installation, and hydro-jetting with guaranteed zero-leak assurance.', 50, 'Westside & Heights', 4.8, 52, 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=150&auto=format&fit=crop&q=80', 1],
  [103, '3', 'Elena Rostova', 3, 'AC Repair', 'HVAC Seasonal Tune-Up & Gas Refill', 'Deep coil cleaning, freon gas top-up, compressor inspection, and duct sanitization to keep air crisp and energy bills low.', 65, 'North Hills & Suburbs', 4.95, 64, 'https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?w=150&auto=format&fit=crop&q=80', 1],
  [104, '4', 'Sparkle Cleaners Team', 4, 'Cleaning', 'Deep Home Sanitization & Carpet Care', 'Eco-friendly thorough deep scrubbing of bathrooms, kitchens, hardwood, and furniture upholstery with industrial equipment.', 35, 'Entire Metro City', 4.7, 89, 'https://images.unsplash.com/photo-1580489944761-15a19d654956?w=150&auto=format&fit=crop&q=80', 1],
  [105, '5', 'Julian Hayes', 5, 'Carpentry', 'Custom Furniture, Shelving & Cabinet Repair', 'Artisanal woodworking, hinge realignment, custom bookshelves, kitchen drawer rebuilding, and precision architectural woodwork.', 55, 'South River District', 4.85, 27, 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=150&auto=format&fit=crop&q=80', 1],
  [106, '6', 'Vibrant Walls Studio', 6, 'Painting', 'Interior Wall Painting & Texture Finishes', 'Dust-free taping, surface priming, decorative accents, and smooth premium paint coatings delivered on time.', 40, 'Central City & Uptown', 4.65, 31, 'https://images.unsplash.com/photo-1522075469751-3a6694fb2f61?w=150&auto=format&fit=crop&q=80', 1],
  [107, '7', 'Priya Nair', 1, 'Electrician', 'Smart Home Setup & Lighting Installation', 'Installation of smart switches, LED lighting layouts, ceiling fans, inverters, and surge protection with neat concealed wiring.', 48, 'Lakeside & Old Town', 4.75, 41, 'https://images.unsplash.com/photo-1438761681033-6461ffad8d80?w=150&auto=format&fit=crop&q=80', 1],
  [108, '8', 'Robert Chen', 2, 'Plumber', 'Bathroom Fitting & Water Heater Installation', 'Geyser installation, shower and tap fitting, toilet repair, tank cleaning, and water pressure correction with clean finishing.', 42, 'East Park & Riverside', 4.6, 36, 'https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=150&auto=format&fit=crop&q=80', 1],
  [109, '9', 'CoolBreeze Technicians', 3, 'AC Repair', 'Split & Window AC Installation and Servicing', 'New AC installation, uninstallation, jet-wash servicing, PCB repair, and leakage fixes with a 30-day service warranty.', 58, 'Metro West & Tech Park', 4.8, 72, 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=150&auto=format&fit=crop&q=80', 1],
  [110, '10', 'Anita Desai', 4, 'Cleaning', 'Kitchen & Bathroom Deep Cleaning', 'Degreasing of chimneys and tiles, descaling of fixtures, cabinet interior cleaning, and stain removal using safe, odor-free products.', 30, 'City Center & Midtown', 4.55, 58, 'https://images.unsplash.com/photo-1544005313-94ddf0286df2?w=150&auto=format&fit=crop&q=80', 0],
  [111, '11', 'Thomas Brandt', 5, 'Carpentry', 'Modular Wardrobe & Door Installation', 'Wardrobe assembly, door and window frame repair, lock fitting, termite-proof polishing, and custom wall-mounted storage units.', 52, 'Northgate & Green Valley', 4.7, 33, 'https://images.unsplash.com/photo-1506794778202-cad84cf45f1d?w=150&auto=format&fit=crop&q=80', 1],
  [112, '12', 'ColorCraft Painters', 6, 'Painting', 'Exterior Painting & Waterproof Coating', 'Weather-resistant exterior coats, crack filling, damp-proofing, balcony and gate painting, with scaffolding handled by the crew.', 38, 'Suburbs & Hillcrest', 4.5, 24, 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=150&auto=format&fit=crop&q=80', 0],
];

if (database.prepare('SELECT COUNT(*) AS count FROM services').get().count === 0) {
  const insert = database.prepare(`
    INSERT INTO services
      (id, provider_id, provider_name, category_id, category_name, title, description, price_per_hour, service_area, rating, review_count, avatar, verified)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const seed = (services) => transaction(() => {
    for (const service of services) insert.run(...service);
  });
  seed(seedServices);
}
