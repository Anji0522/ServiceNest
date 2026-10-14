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

The API creates `data/servicenest.sqlite` on first start and seeds the catalogue. The database directory is local runtime data and is ignored by Git.

## Included features

- Customer and provider account registration and sign-in. Passwords are salted and hashed with Node's `scrypt`; hashed browser sessions are stored in the database and remain valid for 30 days, including across server restarts.
- Customer contact and service address details, provider profiles, service listings, catalogue search, category filtering, and sorting.
- Customer bookings with appointment time, service address, notes, duration, and an itemized hourly total.
- Persistent payment records for cash after service. Online/card payments are intentionally not enabled; connect a payment processor before accepting electronic payment details.
- Customer booking history and a provider dashboard with service requests.
- Persistent, participant-only booking conversations, with messages refreshed automatically while the thread is open.

## API overview

- `GET /api/health`, `GET /api/services`
- `POST /api/auth/register`, `POST /api/auth/login`, `POST /api/auth/logout`, `GET /api/auth/me`
- `GET /api/provider/profile`, `GET|POST /api/provider/services`, `GET /api/provider/bookings`
- `GET|POST /api/bookings`
- `GET|POST /api/bookings/:id/messages`

Authenticated requests use a bearer token. For production, configure HTTPS, request rate limiting, database backups, and an approved payment provider; do not expose the development server directly to the internet.

## Deploy the API with persistent storage

1. Sign in to Render and create a new **Blueprint** from this GitHub repository. Render reads `render.yaml` to create the API service and attach a persistent disk at `/var/data`. The Starter web service and disk are paid Render resources; the disk preserves customer accounts, provider profiles, listings, bookings, payments, and messages across restarts and deployments.
2. After Render finishes deploying, copy the service's public URL (for example, `https://servicenet-api-anji0522.onrender.com`) into the GitHub repository variable **Settings → Secrets and variables → Actions → Variables** as `VITE_API_URL`.
3. Re-run the **Deploy to GitHub Pages** workflow, or push a new commit. The site will then use the hosted API for registration, sign-in, bookings, provider tools, and messages.

The local API allows local development origins; the Render Blueprint restricts the deployed API to the GitHub Pages and ServiceNest custom domains. Set `CORS_ORIGINS` on Render to a comma-separated list of exact trusted origins if the frontend is served from another domain. Do not put credentials or API secrets in `VITE_API_URL` or other `VITE_` variables; frontend build variables are public.

The API stores customer contact details and service addresses, plus booking and conversation records. Passwords are stored as salted hashes; payment card or bank data is not collected. Restrict access to the Render project and disk, use HTTPS, and establish appropriate privacy, retention, and backup practices before collecting real customer data.

## Custom-domain DNS

The Pages build publishes `public/CNAME` for `servicenet.com`. At the domain's DNS provider, point the apex domain to GitHub Pages by adding these four `A` records:

| Host | Type | Value |
| --- | --- | --- |
| `@` | `A` | `185.199.108.153` |
| `@` | `A` | `185.199.109.153` |
| `@` | `A` | `185.199.110.153` |
| `@` | `A` | `185.199.111.153` |

Optionally point `www` to `anji0522.github.io` with a `CNAME` record. DNS changes can take up to 24 hours to propagate; enable **Enforce HTTPS** in GitHub **Settings → Pages** after the domain verifies.

## Checks

```sh
npm run lint
npm run build
```
