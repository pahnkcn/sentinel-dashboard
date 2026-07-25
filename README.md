# Sentinel Dashboard

Sentinel is a read-only staff dashboard for monitoring sensitive mental-health
and physical-wellbeing observations during a 16-week training period. It
provides population trends, room status, and individual follow-up views. It is
decision support, not a diagnostic or data-entry system.

Access is restricted to verified Firebase Authentication users whose ID token
contains `sentinelRole: "clinician"` or `sentinelRole: "admin"`. Firestore
Security Rules are the authorization boundary; the browser is never allowed to
write monitoring records. Authentication uses tab-scoped session persistence,
so closing the tab or browser clears the saved sign-in state.

## Requirements

- Node.js `^20.19.0` or `>=22.12.0`
- npm
- Java 21 recommended for the Firestore Emulator
- A Firebase web app with Google sign-in enabled
- An OpenRouter API key for Sentinel Analyst

## Local setup

Local development is emulator-only. The development template uses a demo
project ID and cannot connect to a remote Firebase project. The guard uses the
actual Vite dev-server command, not the selectable mode name, so
`npm run dev -- --mode production` stops before serving.

```sh
npm ci
npm ci --prefix functions
cp .env.development.example .env.development.local
cp functions/.secret.local.example functions/.secret.local
cp functions/.env.local.example functions/.env.local
npm run emulators
```

In a second terminal:

```sh
npm run emulators:seed
npm run dev
```

Use the Auth Emulator UI or separately controlled Admin SDK tooling connected
to the emulator to create a verified test user with
`sentinelRole: "clinician"` or `"admin"`. The seed command writes a bounded,
synthetic dataset through the loopback-only emulator REST API. It refuses
non-`demo-*` projects and non-loopback hosts; it is not included in the browser
client and cannot write to a remote Firebase project.

Set the real local-only OpenRouter key in `functions/.secret.local`. The
browser calls the Functions emulator through Vite's same-origin `/api/chat`
proxy, so the key is never embedded in browser JavaScript.

Remote builds use `.env.example` as a template. Every placeholder must be
replaced, `VITE_FIREBASE_USE_EMULATORS` must be `false`, and an App Check site
key is required. The build fails before bundling when configuration is missing
or incoherent.

Firebase web configuration is public application metadata, not a server
secret. Restrict the associated API key to the approved browser origins and
required APIs in Google Cloud. Never place Admin SDK credentials or service
account keys in a `VITE_*` variable.

An account can open the dashboard only after its email is verified and an
administrator provisions the required custom claim. See
[Deployment](docs/deployment.md) for claim and App Check setup.

## Verification commands

| Command | Purpose |
| --- | --- |
| `npm run emulators` | Start local Auth and Firestore emulators using the safe demo project |
| `npm run emulators:seed` | Publish synthetic local data to the running Firestore emulator |
| `npm test` | Unit tests for auth, hosting policy, decoding, data lifecycle, and analytics |
| `npm run test:rules` | Firestore rules integration tests in the emulator |
| `npm run lint` | ESLint checks |
| `npm run build` | Production build and code-splitting verification |
| `npm run preview` | Serve the production build locally |

The emulator commands use a pinned Firebase CLI and may download it on the
first run.

## Versioned datasets

The browser first reads the exact `monitoringManifests/current` document. Its
safe `version` selects three bounded collections under one immutable scope:

- `monitoringDatasets/{version}/students`
- `monitoringDatasets/{version}/logs`
- `monitoringDatasets/{version}/assessments`

Records are decoded into strict known-field shapes before analytics can see
them. The data Module buffers all three server-confirmed streams and replaces
application state only after the complete version is available. Invalid,
truncated, mixed, or same-version-mutated datasets pause all analytics rather
than presenting partial results.

Cache-only snapshots and snapshots with pending local writes never enter
application state: the manifest and every stream must be confirmed by the
Firestore server with no uncommitted overlay. A later unverified transition
pauses analytics. The displayed last-verified time is when the complete
dataset became verified, not an independent heartbeat or the age of the
source observations. Domain terms, ranges, scheduled weeks, and LOCF rules are
in [CONTEXT.md](CONTEXT.md).

## Architecture and operations

- [Architecture](docs/architecture.md)
- [Security model](docs/security.md)
- [Deployment runbook](docs/deployment.md)
- [Architecture decision records](docs/adr/)

## Sentinel Analyst

The floating assistant appears only after an authorized user opens the
dashboard. It works from the same verified, fail-closed dataset as the three
workflow screens. General questions receive aggregate context; student and room
details are selected only when a question requires them. The server replaces
student names and IDs with per-request aliases and removes sensitive free text
before OpenRouter Fusion performs multi-model deliberation. A separate
structured-output formatter maps the evidence back to the authorized user's
original context and produces validated text, tables, and Recharts
visualizations. Exploratory predictions use a bounded linear trend and are
always labeled as decision support rather than diagnosis.

OpenRouter is called only from the authenticated Cloud Function. Every remote
request requires a verified Firebase ID token, an allowed clinical role, and a
valid App Check token. Fusion is forced for each question with the
`general-fast` preset; its memo is passed to a ZDR structured-output formatter.
Both stages disallow data-collecting providers and enforce Zero Data Retention
endpoints.

Administrative imports and fixture generation deliberately do not exist in
this client. Put those operations in separately authorized server-side tooling
with audit logs and backups. Stage a new immutable version, validate all three
collections, and change `monitoringManifests/current` only as the final publish
operation; see the [deployment runbook](docs/deployment.md).
