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
- A dedicated OpenRouter API key with access to `z-ai/glm-5.2` for model-backed
  Sentinel Analyst requests

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

The local seed publishes a large synthetic load-test dataset with 250 students
across 25 rooms, 16 weekly observations per student, and assessments at weeks
0, 4, 8, and 16 (5,250 records total). Each run publishes a fresh immutable
dataset version, and the manifest switches only after all records have been
written. This seed remains restricted to the loopback-only `demo-*` emulator.

Use the Auth Emulator UI or separately controlled Admin SDK tooling connected
to the emulator to create a verified test user with
`sentinelRole: "clinician"` or `"admin"`. The seed command writes a bounded,
synthetic dataset through the loopback-only emulator REST API. It refuses
non-`demo-*` projects and non-loopback hosts; it is not included in the browser
client and cannot write to a remote Firebase project.

Set the emulator-only OpenRouter secret in `functions/.secret.local`; never
commit that file or copy its value into a `VITE_*` variable. The browser calls
the Functions emulator through Vite's same-origin `/api/chat` proxy, so the key
is never embedded in browser JavaScript. Set `OPENROUTER_PROVIDER` in
`functions/.env.local` to the exact provider slug approved for the synthetic
test; a missing value fails closed to deterministic analysis.

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
| `npm test` | Unit tests for auth, hosting policy, decoding, data lifecycle, analytics, server retrieval, and AI disclosure policy |
| `npm run eval:openrouter -- --compile-only` | Compile synthetic privacy cases and measure disclosure without network egress |
| `npm run eval:openrouter -- --provider APPROVED_SLUG` | Run synthetic model evaluation against the exact reviewed provider |
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
dashboard. The browser sends only the current question and the dataset version
shown on screen; it never supplies Firestore records, an AI context object, or
prior assistant messages. The authenticated Function independently reads the
exact current manifest and bounded versioned collections, decodes every record,
checks references, and rejects the request if the browser and server dataset
versions differ.

The server then routes the request through a privacy policy:

- privacy, clinical-safety, causal, over-broad, and ambiguous requests return a
  fixed local-only response without calling OpenRouter;
- individual, people-ranking, room, coverage, latest-value, week-comparison,
  forecast, chart, and table requests use deterministic server-side renderers
  and do not call OpenRouter;
- a cohort below the minimum sample size and an overview limited to an explicit
  metric are also handled deterministically;
- only a broad, multi-metric population-overview narrative with at least one
  usable cohort trend can enter the model-backed route. It is reduced to a
  canonical task plus qualitative directions for available metrics. Exact
  scores, counts, dates, identifiers, alert status, missing-data status, and
  narrative fields are absent; the complete dynamic outbound packet is capped
  at 1,536 UTF-8 bytes.

“Local-only” here means ordinary deterministic code inside the authenticated
Firebase Function. It does not require an AI model on the user's computer.

The configured model is pinned to `z-ai/glm-5.2`. OpenRouter is called only from
the Function after an exact reviewed provider slug is configured, with
OpenRouter provider fallback disabled, required structured-output parameters,
`data_collection: "deny"`, and `zdr: true`.
These controls reduce retention and disclosure, but they do **not** keep
model-backed data inside Firebase: the qualitative population facts are still
processed by OpenRouter and the selected underlying provider. Deployment
therefore requires explicit privacy, contractual, residency, and clinical
approval.

The provider is limited to an 800-token strict narrative schema containing only
`answer`, `confidence`, and `followUps`. Model output is untrusted: the Function
validates it, rejects digits and undisclosed entity tokens, then merges the
server's exact deterministic highlights, coverage, and method note. Those exact
values are never supplied to the model. If the key is unavailable, the provider
or credit fails, the request times out, or response validation fails, the
Function returns the precomputed deterministic overview instead. That
application fallback is distinct from OpenRouter provider fallback, which
remains disabled. A fallback after an attempted provider request does not undo
the egress that already occurred; the response privacy metadata records whether
an external request was attempted, and each answer shows that status plus the
dynamic disclosure size in the UI. Exploratory predictions are calculated and
rendered deterministically on the server and remain decision support rather
than diagnosis.

Administrative imports and fixture generation deliberately do not exist in
this client. Put those operations in separately authorized server-side tooling
with audit logs and backups. Stage a new immutable version, validate all three
collections, and change `monitoringManifests/current` only as the final publish
operation; see the [deployment runbook](docs/deployment.md).
