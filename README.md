# ServiceNest

ServiceNest is a React single-page app for browsing local home-service professionals. The current version is a front-end demo backed by sample data in `src/App.jsx`; it does not include a live booking API, authentication, or provider accounts.

# Live Demo Link :- https://serviceNET.com

## Features

- Browse sample electricians, plumbers, HVAC technicians, cleaners, carpenters, and painters.
- Filter services by category and search by provider, service, description, or service area.
- Sort listings by hourly price or rating.
- View provider verification, ratings, reviews, service areas, and sample hourly prices.

## Requirements

- Node.js compatible with Vite 8
- npm

## Run locally

```sh
npm ci
npm run dev
```

Vite prints the local development URL in the terminal.

## Quality checks

```sh
npm run lint
npm run build
npm run preview
```

The production site is generated in `dist/`.

## Deployment

GitHub Actions builds and deploys the site to GitHub Pages whenever changes are pushed to `main`. The workflow builds with `npm run build` and publishes `dist/`.

The custom domain `serviceNET.com` is attached to this repository's GitHub Pages site. For the apex domain, configure these `A` records with your DNS provider:

| Host | Type | Value |
| --- | --- | --- |
| `@` | `A` | `185.199.108.153` |
| `@` | `A` | `185.199.109.153` |
| `@` | `A` | `185.199.110.153` |
| `@` | `A` | `185.199.111.153` |

After the DNS records propagate, enable **Enforce HTTPS** in the repository's **Settings → Pages**. DNS changes can take up to 24 hours to propagate.
