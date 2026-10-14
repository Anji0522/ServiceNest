# ServiceNest

ServiceNest is a React single-page app for browsing local home-service professionals. The current version is a front-end demo backed by sample data in `src/App.jsx`; it does not include a live booking API, authentication, or provider accounts.

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

The custom domain is configured as `serviceNET.com` in `public/CNAME`. In the repository's **Settings → Pages**, select **GitHub Actions** as the build and deployment source. Configure the domain's DNS with the records GitHub Pages specifies for an apex domain, then enable HTTPS in the Pages settings. DNS changes may take time to propagate.
