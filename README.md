# ServiceNest

ServiceNest is a React service marketplace with a Node.js API and a local SQLite database.

## Live demo

[Open the ServiceNest live demo](https://anji0522.github.io/ServiceNest/).

The hosted demo displays the sample catalogue until the Render API is deployed and the `VITE_API_URL` GitHub Actions repository variable is configured. Local development runs the API alongside the frontend.

## Requirements

- Node.js 22.13 or newer (the API uses Node's built-in SQLite support).
- npm.

## Run locally

```sh
npm install
npm run dev
```

This starts the Vite frontend and the API together. Open the URL printed by Vite. The API listens on `http://127.0.0.1:3001`; Vite proxies `/api` requests to it.

To run either process separately, use:

```sh
npm run dev:web
```

and:

```sh
npm run api
```

in separate terminals.

For a built local preview, run:

```sh
npm run build
npm run preview
```

The preview command also starts the API and proxies account, booking, and service requests locally.

The API creates `data/servicenest.sqlite` on first start and seeds the catalogue. The database directory is local runtime data and is ignored by Git.

## Included features

- Customer and provider account registration and sign-in via Express. Registration validates email and international phone numbers, prevents duplicate emails and phone numbers, and returns clear `400`, `401`, `409`, and `500` JSON errors.
- Passwords are hashed with bcrypt; signed HS256 JWTs are stored as hashes in the database so they can be revoked and remain valid for 30 days, including across server restarts.
- Existing scrypt password hashes are upgraded to bcrypt on sign-in when the password fits bcrypt's 72-byte limit.
- Customer contact and service address details, provider profiles, service listings, catalogue search, category filtering, and sorting.
- Customer bookings with appointment time, service address, notes, duration, and an itemized hourly total.
- Authenticated sessions persisted in localStorage and restored on refresh, with cross-tab synchronization, role-protected customer/provider dashboards, and automatic logout on expired or rejected credentials.
- Customer and provider booking history, isolated by the authenticated role and including counterpart contact details, service information, appointment time, status, and payment status.
- Cash-after-service bookings and optional Razorpay Checkout with idempotent booking creation, signed payment verification, webhook signature verification, duplicate-event protection, and persistent payment records.
- Card and bank details are handled by Razorpay and are not stored by ServiceNest.
- Persistent, participant-only booking conversations, with messages refreshed automatically while the thread is open.

## AI-Assisted Development

ServiceNest was developed with the support of AI-powered development tools to improve development efficiency, code structure, debugging, and UI/UX design.

### AI tools used

- **Antigravity** — used as an AI-assisted development tool for code structure, project organization, implementation guidance, debugging, and improving the overall application architecture.
- **Google AI Studio** — used for UI/UX ideation, interface design guidance, component ideas, and improving the overall user experience and visual consistency.

AI tools were used as development assistants throughout the project. The application architecture, feature integration, API implementation, database integration, authentication, payment flow, testing, and final deployment configuration were reviewed and implemented as part of the project development process.

## API overview

- `GET /api/health`
- `GET /api/services`
- `POST /api/auth/register`
- `POST /api/auth/login`
- `POST /api/auth/logout`
- `GET /api/auth/me`
- `GET /api/provider/profile`
- `GET|POST /api/provider/services`
- `GET /api/provider/bookings`
- `GET /api/bookings/my-history`
- `GET|POST /api/bookings`
- `POST /api/payments/verify`
- `POST /api/webhooks/razorpay`
- `GET|POST /api/bookings/:id/messages`

Authenticated requests use a bearer token.

For production, configure HTTPS, request rate limiting, database backups, and an approved payment provider; do not expose the development server directly to the internet.

## Database schema

The account table uses this SQLite schema. `password_salt` remains for upgrading existing scrypt accounts, and `address` supports customer bookings:

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

Registration accepts:

- `name`
- `email`
- `password`
- `role` (`customer` or `provider`)
- `phone`
- `address` (optional)

Provider registrations also require:

- `businessName`
- `categoryId`
- `description`
- `serviceArea`
- `hourlyRate`

The API returns a signed JWT containing `userId` and `role`, plus a profile without password fields.

Set a private `JWT_SECRET` of at least 32 bytes in production; the Render Blueprint generates one automatically.

## Configure Razorpay

Razorpay is optional; cash-after-service bookings work without gateway credentials.

To enable online payments:

1. Add `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, and `RAZORPAY_WEBHOOK_SECRET` to the Render service's environment. The Blueprint declares these as private values and never includes credential values in the repository.

2. In the Razorpay dashboard, create a webhook pointing to:

```text
https://<your-render-service>/api/webhooks/razorpay
```

Subscribe to:

- `payment.captured`
- `payment.failed`

Set the webhook secret to the exact value configured as `RAZORPAY_WEBHOOK_SECRET`.

3. Redeploy the API.

The frontend requests an order using an idempotency key and verifies the checkout signature.

The webhook independently verifies its HMAC signature, deduplicates event IDs, and updates payment and booking status.

Do not use real payment credentials for local or test runs.

Booking/payment rows are committed atomically in SQLite. Razorpay order creation is an external operation and cannot participate in the SQL transaction.

The API keeps the booking/payment intent and allows the same idempotency key to reconcile or retry an order-creation failure without creating another booking.

Webhook event handling and payment/booking status updates are transactional.

## Deploy the API with persistent storage

1. Sign in to Render and create a new **Blueprint** from this GitHub repository.

Render reads `render.yaml` to create the API service and attach a persistent disk at `/var/data`.

The Starter web service and disk are paid Render resources. The disk preserves:

- Customer accounts
- Provider profiles
- Service listings
- Bookings
- Payments
- Messages

across restarts and deployments.

2. After Render finishes deploying, copy the service's public URL, for example:

```text
https://servicenet-api-anji0522.onrender.com
```

into the GitHub repository variable:

```text
Settings → Secrets and variables → Actions → Variables
```

Create the variable:

```text
VITE_API_URL
```

3. Re-run the **Deploy to GitHub Pages** workflow, or push a new commit.

The site will then use the hosted API for:

- Registration
- Sign-in
- Bookings
- Provider tools
- Messages

## CORS and production configuration

The local API allows the standard Vite development and preview origins on ports:

- `5173`
- `5174`
- `4173`
- `4174`

including Vite's fallback ports when a default port is already in use.

The Render Blueprint restricts the deployed API to the GitHub Pages and ServiceNest custom domains.

Set `CORS_ORIGINS` on Render to a comma-separated list of exact trusted origins if the frontend is served from another domain.

Do not put credentials or API secrets in `VITE_API_URL` or other `VITE_` variables; frontend build variables are public.

## Data and security considerations

The API stores:

- Customer contact details
- Service addresses
- Booking records
- Conversation records
- Provider information
- Service listings
- Payment records

Passwords are bcrypt-hashed.

Payment card or bank data is not collected or stored by ServiceNest.

Restrict access to the Render project and persistent disk, use HTTPS, and establish appropriate privacy, retention, and backup practices before collecting real customer data.

## Checks

Run the following commands before deployment:

```sh
npm run lint
npm run build
```

## Project highlights

ServiceNest demonstrates a full-stack marketplace architecture combining:

- React
- Vite
- Node.js
- Express
- SQLite
- JWT authentication
- bcrypt password hashing
- REST APIs
-
