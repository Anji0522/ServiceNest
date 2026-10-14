# ServiceNest

ServiceNest is a React service marketplace with a Node.js API and a local SQLite database.

## Live demo

[Open the ServiceNest demo on GitHub Pages](https://anji0522.github.io/ServiceNET/).

The hosted demo displays the sample service catalogue. Sign-in, bookings, provider tools, and messaging require the API, which you can run locally using the instructions below.

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

- Customer and provider account registration and sign-in. Passwords are salted and hashed with Node's `scrypt`; browser sessions use a bearer token in local storage.
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

Authenticated requests use `Authorization: Bearer <token>`. The local session store is in memory, so users sign in again after restarting the API. For production, configure HTTPS, persistent/revocable sessions, request rate limiting, database backups, and an approved payment provider; do not expose the development server directly to the internet.

## Checks

```sh
npm run lint
npm run build
```
