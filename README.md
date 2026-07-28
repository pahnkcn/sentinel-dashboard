# Sentinel Dashboard

Sentinel is a read-only wellbeing-monitoring dashboard. This deployment profile
uses Vercel for the Vite SPA and all same-origin API routes. Firebase is used
only for Cloud Firestore storage; the browser never loads the Firebase SDK and
Firestore Security Rules deny every client read and write.

> **Demo restriction:** Vercel Hobby is for personal, non-commercial use. This
> repository's Hobby deployment must contain synthetic data only. It is not an
> approved clinical or production hosting profile.

## Runtime overview

- Google Identity Services (GIS) supplies an ID token to `POST /api/auth/login`.
- The server verifies GIS CSRF and token claims, checks
  `authorizedUsers/{sha256(normalizedEmail)}`, and issues an HttpOnly
  browser-session cookie.
- Vercel Functions exchange Vercel OIDC for short-lived Google credentials and
  read Firestore through the REST API with `roles/datastore.viewer` only.
- The browser loads `/api/manifest`, then the paginated `students`, `logs`, and
  `assessments` streams. It checks the manifest again before publishing one
  complete version to the UI. Data loads on entry and explicit refresh only;
  there is no background polling.
- `/api/chat` keeps the existing privacy envelope and server-side OpenRouter
  boundary. No provider key is present in browser code.

See [architecture](docs/architecture.md), [security](docs/security.md), and the
[deployment runbook](docs/deployment.md) for the full design.

## Local development

Requirements: Node.js 22.x, a Google OAuth web client for localhost, Java for the
Firestore Emulator, and Application Default Credentials only when testing
operator writes against a remote project.

```powershell
npm ci
Copy-Item .env.development.example .env.local
npx vercel link
npx vercel pull --yes --environment=development
npm run emulators
```

In another terminal:

```sh
npm run emulators:seed -- --end-date 2026-07-28
npm run auth:provision -- --email clinician@example.com --role clinician --project-id demo-sentinel-dashboard --emulator-host 127.0.0.1:8080 --commit
npm run dev:vercel
```

The emulator guard accepts only a loopback host and a Firebase project ID that
starts with `demo-`. Local seed records are synthetic schema v2 records.
Use an email that belongs to the localhost Google OAuth client test users.

## Environment

Copy `.env.example` into Vercel project settings, not into source control.

- `VITE_GOOGLE_CLIENT_ID` is the only browser-exposed provider value.
- `GOOGLE_CLIENT_ID` and `SESSION_SECRET` are server-only.
- `GCP_PROJECT_ID`, `GCP_PROJECT_NUMBER`, `GCP_SERVICE_ACCOUNT_EMAIL`,
  `GCP_WORKLOAD_IDENTITY_POOL_ID`, and
  `GCP_WORKLOAD_IDENTITY_PROVIDER_ID` configure keyless OIDC federation.
- `OPENROUTER_API_KEY`, `OPENROUTER_MODEL`, and `OPENROUTER_SITE_URL` are
  server-only. Store the key as an encrypted Vercel environment variable.
- `VERCEL_OIDC_TOKEN` is issued by Vercel; never enter or persist it manually.

Do not add `VITE_FIREBASE_*`, a Firebase service-account key, or any server
secret to a Vite-prefixed variable.

## Synthetic workbook workflow

The source workbook remains outside the repository and is opened read-only.
The profiler retains only aggregate counts, score distributions, missingness,
and quality totals. It never writes source names, identifiers, rooms, dates, or
per-person trajectories.

Generate deterministic demo data relative to an explicit end date:

```sh
npm run demo:generate -- \
  --workbook "C:\path\to\trusted-workbook.xlsx" \
  --end-date 2026-07-28 \
  --seed reviewed-demo-v2 \
  --output .generated/sentinel-demo.json \
  --profile-output .generated/workbook-profile.json
```

Use `--default-profile` instead of `--workbook` when no source workbook is
available. Generated files are ignored by Git. Review the aggregate quality
report and synthetic output before publishing.

Publishing is a dry-run unless `--commit` is present:

```sh
npm run demo:publish -- \
  --dataset .generated/sentinel-demo.json \
  --project-id YOUR_EXPLICIT_PROJECT_ID \
  --version demo-2026-07-28

npm run demo:publish -- \
  --dataset .generated/sentinel-demo.json \
  --project-id YOUR_EXPLICIT_PROJECT_ID \
  --version demo-2026-07-28 \
  --commit
```

The publisher uses operator ADC, creates immutable versioned records with an
`exists: false` precondition, and changes `monitoringManifests/current` only
after every record batch succeeds. Vercel's runtime service account cannot run
this operation.

Provision or disable an allowlisted user with the same dry-run-first behavior:

```sh
npm run auth:provision -- \
  --email clinician@example.com \
  --role clinician \
  --project-id YOUR_EXPLICIT_PROJECT_ID

npm run auth:provision -- \
  --email clinician@example.com \
  --role clinician \
  --project-id YOUR_EXPLICIT_PROJECT_ID \
  --commit
```

Use `--disable --commit` to revoke access without deleting the audit-visible
allowlist document.

## Verification

```sh
npm test
npm run test:rules
npm run lint
npm run build
npm run vercel:build
```

Rules tests require the Firestore emulator. Deployment acceptance also includes
an `npm run dev:vercel` smoke test after `vercel link`/`vercel pull` and the
checks in the deployment runbook.
