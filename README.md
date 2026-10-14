# ServiceNest

ServiceNest is a React service marketplace with a Node.js API and a local SQLite database.

## Live demo

[Open the ServiceNest demo on GitHub Pages](https://anji0522.github.io/ServiceNET/).

The hosted demo displays the sample catalogue until the Render API is deployed and the `VITE_API_URL` GitHub Actions repository variable is configured. Local development runs the API alongside the frontend.

## Requirements

- Node.js 22.13 or newer (the API uses Node's built-in SQLite support).
- npm.

## Run locally

```sh
npm install
npm run dev
```

This starts the Vite frontend and the API together. Open the URL printed by Vite. The API listens on `http://127.0.0.1:3001`; Vite proxies `/api` requests to it. To run either process separately, use `npm run dev:web` and `npm run api` in separate terminals.

For a built local preview, run `npm run build` and then `npm run preview`. The preview command also starts the API and proxies account, booking, and service requests locally.

The API creates `data/servicenest.sqlite` on first start and seeds the catalogue. The database directory is local runtime data and is ignored by Git.

## Included features

- Customer and provider account registration and sign-in via Express. Registration validates email and international phone numbers, prevents duplicate emails and phone numbers, and returns clear `400`, `401`, `409`, and `500` JSON errors. Passwords are hashed with bcrypt; signed HS256 JWTs are stored as hashes in the database so they can be revoked and remain valid for 30 days, including across server restarts. Existing scrypt password hashes are upgraded to bcrypt on sign-in when the password fits bcrypt's 72-byte limit.
- Customer contact and service address details, provider profiles, service listings, catalogue search, category filtering, and sorting.
- Customer bookings with appointment time, service address, notes, duration, and an itemized hourly total.
- Authenticated sessions persisted in localStorage and restored on refresh, with cross-tab synchronization, role-protected customer/provider dashboards, and automatic logout on expired or rejected credentials.
- Customer and provider booking history, isolated by the authenticated role and including counterpart contact details, service information, appointment time, status, and payment status.
- Cash-after-service bookings and optional Razorpay Checkout with idempotent booking creation, signed payment verification, webhook signature verification, duplicate-event protection, and persistent payment records. Card and bank details are handled by Razorpay and are not stored by ServiceNest.
- Persistent, participant-only booking conversations, with messages refreshed automatically while the thread is open.

## API overview

- `GET /api/health`, `GET /api/services`
- `POST /api/auth/register`, `POST /api/auth/login`, `POST /api/auth/logout`, `GET /api/auth/me`
- `GET /api/provider/profile`, `GET|POST /api/provider/services`, `GET /api/provider/bookings`
- `GET /api/bookings/my-history` (customer/provider results are filtered from the authenticated user's role)
- `GET|POST /api/bookings` (booking creation requires an `Idempotency-Key` header)
- `POST /api/payments/verify`, `POST /api/webhooks/razorpay`
- `GET|POST /api/bookings/:id/messages`

Authenticated requests use a bearer token. For production, configure HTTPS, request rate limiting, database backups, and an approved payment provider; do not expose the development server directly to the internet.

The account table uses this SQLite schema; `password_salt` remains for upgrading existing scrypt accounts, and `address` supports customer bookings:

```sql
CREATE TABLE users (
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
```

Phone numbers are normalized and checked inside an atomic write transaction, preventing new duplicate registrations while keeping existing databases with older phone formatting usable.

Registration accepts `name`, `email`, `password`, `role` (`customer` or `provider`), and `phone`; `address` is optional. Provider registrations also require `businessName`, `categoryId`, `description`, `serviceArea`, and `hourlyRate`. The API returns a signed JWT containing `userId` and `role`, plus a profile without password fields. Set a private `JWT_SECRET` of at least 32 bytes in production; the Render Blueprint generates one automatically.

### Configure Razorpay

Razorpay is optional; cash-after-service bookings work without gateway credentials. To enable online payments:

1. Add `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, and `RAZORPAY_WEBHOOK_SECRET` to the Render service's environment. The Blueprint declares these as private values and never includes credential values in the repository.
2. In the Razorpay dashboard, create a webhook pointing to `https://<your-render-service>/api/webhooks/razorpay`. Subscribe to `payment.captured` and `payment.failed`, and set the webhook secret to the exact value configured as `RAZORPAY_WEBHOOK_SECRET`.
3. Redeploy the API. The frontend requests an order using an idempotency key, and verifies the checkout signature. The webhook independently verifies its HMAC signature, deduplicates event IDs, and updates payment and booking status. Do not use real payment credentials for local or test runs.

Booking/payment rows are committed atomically in SQLite. Razorpay order creation is an external operation and cannot participate in the SQL transaction; the API keeps the booking/payment intent and allows the same idempotency key to reconcile or retry an order-creation failure without creating another booking. Webhook event handling and payment/booking status updates are transactional.

## Deploy the API with persistent storage

1. Sign in to Render and create a new **Blueprint** from this GitHub repository. Render reads `render.yaml` to create the API service and attach a persistent disk at `/var/data`. The Starter web service and disk are paid Render resources; the disk preserves customer accounts, provider profiles, listings, bookings, payments, and messages across restarts and deployments.
2. After Render finishes deploying, copy the service's public URL (for example, `https://servicenet-api-anji0522.onrender.com`) into the GitHub repository variable **Settings ÃƒÂ¢Ã¢â‚¬Â Ã¢â‚¬â„¢ Secrets and variables ÃƒÂ¢Ã¢â‚¬Â Ã¢â‚¬â„¢ Actions ÃƒÂ¢Ã¢â‚¬Â Ã¢â‚¬â„¢ Variables** as `VITE_API_URL`.
3. Re-run the **Deploy to GitHub Pages** workflow, or push a new commit. The site will then use the hosted API for registration, sign-in, bookings, provider tools, and messages.

The local API allows the standard Vite development and preview origins on ports 5173, 5174, 4173, and 4174, including Vite's fallback ports when a default port is already in use. The Render Blueprint restricts the deployed API to the GitHub Pages and ServiceNest custom domains. Set `CORS_ORIGINS` on Render to a comma-separated list of exact trusted origins if the frontend is served from another domain. Do not put credentials or API secrets in `VITE_API_URL` or other `VITE_` variables; frontend build variables are public.

The API stores customer contact details and service addresses, plus booking and conversation records. Passwords are bcrypt-hashed; payment card or bank data is not collected. Restrict access to the Render project and disk, use HTTPS, and establish appropriate privacy, retention, and backup practices before collecting real customer data.

## Custom-domain DNS

The Pages build publishes `public/CNAME` for `servicenet.com`. At the domain's DNS provider, point the apex domain to GitHub Pages by adding these four `A` records:

| Host | Type | Value |
| --- | --- | --- |
| `@` | `A` | `185.199.108.153` |
| `@` | `A` | `185.199.109.153` |
| `@` | `A` | `185.199.110.153` |
| `@` | `A` | `185.199.111.153` |

Optionally point `www` to `anji0522.github.io` with a `CNAME` record. DNS changes can take up to 24 hours to propagate; enable **Enforce HTTPS** in GitHub **Settings ÃƒÂ¢Ã¢â‚¬Â Ã¢â‚¬â„¢ Pages** after the domain verifies.

## Checks

```sh
npm run lint
npm run build
```
