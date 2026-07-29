# Vercel Hobby deployment runbook

This runbook deploys a personal, non-commercial synthetic demonstration.
Vercel Hobby must not host real or re-identifiable monitoring data. Firebase is
used only for Cloud Firestore.

Current references:

- [Vercel Hobby limits](https://vercel.com/docs/plans/hobby)
- [Vercel OIDC for GCP](https://vercel.com/docs/oidc/gcp)
- [Vercel Function duration](https://vercel.com/docs/functions/configuring-functions/duration)
- [Google Identity server verification](https://developers.google.com/identity/gsi/web/guides/verify-google-id-token)
- [Firestore security rules](https://firebase.google.com/docs/firestore/security/get-started)

## 1. Create the Google Cloud and OAuth resources

1. Create or select one Google Cloud project and initialize Cloud Firestore in
   a region compatible with the application's data-residency decision.
2. Deploy `firestore.rules` before adding any documents. The rules deny every
   browser read and write, including Firebase-authenticated clients.
3. Create a Google OAuth Web client. For the helper, register the exact
   JavaScript origin `http://localhost:3000` and always open that URL (not
   `http://127.0.0.1:3000`). Register only the exact production and optional
   stable staging origins later. Do not add wildcard preview domains.
4. Record the OAuth client ID for both `VITE_GOOGLE_CLIENT_ID` and
   `GOOGLE_CLIENT_ID`; the values must match.
5. Create a dedicated OpenRouter key only if Sentinel Analyst is enabled. Turn
   off input/output logging and data-discount sharing and set a hard budget.

Deploy and test the rules:

```sh
npx firebase-tools@14.23.0 deploy --only firestore:rules --project YOUR_PROJECT_ID
npm run test:rules
```

An Admin/REST client authenticated by IAM bypasses Security Rules. Rules tests
do not prove that a service account is least privilege.

## 2. Configure Vercel OIDC and GCP Workload Identity Federation

Use Vercel's team issuer mode so the issuer is scoped to the Vercel team.

1. In GCP IAM & Admin, create a Workload Identity Pool and an OIDC provider.
2. Set issuer to `https://oidc.vercel.com/TEAM_SLUG` and allowed audience to
   `https://vercel.com/TEAM_SLUG`.
3. Map `google.subject` to `assertion.sub`.
4. Create a dedicated service account such as
   `sentinel-vercel-reader@PROJECT_ID.iam.gserviceaccount.com`.
5. Grant that service account only `roles/datastore.viewer` on the project.
6. On the service account, grant `roles/iam.workloadIdentityUser` only to this
   production principal:

   ```text
   principal://iam.googleapis.com/projects/PROJECT_NUMBER/locations/global/workloadIdentityPools/POOL_ID/subject/owner:TEAM_SLUG:project:VERCEL_PROJECT_NAME:environment:production
   ```

7. Do not grant the preview subject or an entire pool principal access to the
   production reader.
8. Enable the IAM Credentials, Security Token Service, and Firestore APIs.

The Vercel Functions exchange their request OIDC token for a short-lived access
token. Do not create a service-account JSON key and do not store
`VERCEL_OIDC_TOKEN` as an environment variable.

## 3. Configure Vercel

Import the repository as a Vite project. `vercel.json` fixes the build output to
`dist`, Function region to `sin1`, Fluid Compute on, chat duration to 90 seconds,
and other API durations to 15 seconds.

Set these Production environment variables:

```text
VITE_GOOGLE_CLIENT_ID
GOOGLE_CLIENT_ID
SESSION_SECRET
GCP_PROJECT_ID
GCP_PROJECT_NUMBER
GCP_SERVICE_ACCOUNT_EMAIL
GCP_WORKLOAD_IDENTITY_POOL_ID
GCP_WORKLOAD_IDENTITY_PROVIDER_ID
OPENROUTER_API_KEY
OPENROUTER_MODEL
OPENROUTER_SITE_URL
```

`SESSION_SECRET` must contain at least 32 cryptographically random bytes. Keep
all variables except `VITE_GOOGLE_CLIENT_ID` server-only. Scope production GCP
and OpenRouter values to Production, not Preview or Development.

For Preview, set only the Google login pair and an independent session secret:

```text
VITE_GOOGLE_CLIENT_ID
GOOGLE_CLIENT_ID
SESSION_SECRET
```

The two client IDs must match. Do not configure `GCP_PROJECT_ID`, the remaining
GCP Workload Identity variables, `OPENROUTER_API_KEY`, or
`FIRESTORE_EMULATOR_HOST` for Preview. This guarantees that a Preview cannot
read Production Firestore or call the production model provider even if its
application access gate is bypassed.

In Project Settings > Deployment Protection, enable Vercel Authentication with
Standard Protection. This protects preview deployments on Hobby; production
still relies on the application GIS access gate. Configure a Vercel WAF rate
rule for `POST /api/chat` in addition to the in-process limiter.

## 4. Generate and review synthetic data

Keep the trusted workbook outside the repository. Generate a profile and
dataset with an explicit end date and reviewed deterministic seed:

```sh
npm run demo:generate -- --workbook "C:\path\to\trusted-workbook.xlsx" --end-date 2026-07-28 --seed reviewed-demo-v2 --output .generated/sentinel-demo.json --profile-output .generated/workbook-profile.json
```

The command validates the five sheets, formula results, duplicate Self rows,
Buddy zero values, canonical hidden Command sheet, week agreement, and score
ranges. It writes only aggregate profile information and unrelated synthetic
records.

Review before publication:

- profile `schemaVersion` is 2 and contains no names, IDs, rooms, source dates,
  or per-person series;
- dataset `dataClassification` is `synthetic`;
- every student, log, and assessment ID begins with `demo-`;
- names and rooms are generic demo labels;
- DASS is 0–21, CD-RISC 0–40, and GRIT 0–32;
- nullable logs contain at least one actually observed channel;
- the source workbook and `.generated/` files are not staged in Git.

## 5. Publish with a separate operator identity

The publisher uses Application Default Credentials. Authenticate an audited
operator that can write only the dataset, current manifest, and allowlist paths;
do not use the Vercel reader service account.

Always run dry-run first:

```sh
npm run demo:publish -- --dataset .generated/sentinel-demo.json --project-id YOUR_PROJECT_ID --version demo-2026-07-28
```

After two-person review of project, version, classification, and counts:

```sh
npm run demo:publish -- --dataset .generated/sentinel-demo.json --project-id YOUR_PROJECT_ID --version demo-2026-07-28 --commit
```

Candidate records have an `exists: false` precondition. All immutable batches
must succeed before the tool updates `monitoringManifests/current`. If any
candidate batch fails, do not change the manifest; investigate the unpublished
version and either complete it under the same controlled procedure or choose a
new version.

Record the operator, source workbook checksum (not its contents), generated
dataset checksum, project, version, counts, quality report, and manifest update
time in the deployment audit trail.

## 6. Provision authorized users

Dry-run and review the normalized email, role, document hash, and project:

```sh
npm run auth:provision -- --email clinician@example.com --role clinician --project-id YOUR_PROJECT_ID
```

Then commit:

```sh
npm run auth:provision -- --email clinician@example.com --role clinician --project-id YOUR_PROJECT_ID --commit
```

Only `clinician` and `admin` are valid. Revoke access with the same command plus
`--disable --commit`; do not delete the document. Rotate `SESSION_SECRET` when
all outstanding Sentinel sessions must be invalidated immediately.

## 7. Pre-deployment gate

The recommended helper runs this gate sequentially, fails before deployment on
the first error, scans `dist` for Firebase browser code, and scans the complete
`.vercel/output` tree for key material and known local/target secret values:

```sh
npm run deploy:check
```

Review the exact plan without running it:

```sh
npm run deploy:check -- --dry-run
```

The underlying manual commands remain:

```sh
npm ci
npm test
npm run test:rules
npm run lint
npm run build
npm run vercel:build
```

Inspect `dist` and the Vercel build output. They must not contain Firebase Auth,
App Check, Firebase client configuration, `VITE_FIREBASE_*`, service-account
material, `SESSION_SECRET`, or `OPENROUTER_API_KEY`.

Run a local smoke test with the Firestore emulator:

```sh
cp .env.development.example .env.local
npm run deploy:local -- --email clinician@example.com --end-date 2026-07-28
```

This command uses `vercel dev --local`, so it does not create or change a Vercel
project link. It owns and cleans up the Emulator and Vercel Dev process trees, seeds
only `demo-sentinel-dashboard` on `127.0.0.1:8080`, provisions the supplied
email only in that emulator, and verifies that the signed-out session endpoint
returns `401` with `Cache-Control: private, no-store`.

The equivalent manual sequence is:

```sh
cp .env.development.example .env.local
npm run emulators
npm run emulators:seed -- --end-date 2026-07-28
npm run auth:provision -- --email clinician@example.com --role clinician --project-id demo-sentinel-dashboard --emulator-host 127.0.0.1:8080 --commit
npm run dev:vercel
```

The emulator seed command refuses non-loopback hosts and project IDs that do
not begin with `demo-`. Use the same email as the localhost Google OAuth test
user when provisioning the emulator allowlist.

## 8. Deploy and verify

Create a protected preview first, then promote the reviewed commit to
Production. Verify:

```sh
npx vercel link
npm run deploy:preview
npm run deploy:production -- --confirm-project YOUR_LINKED_VERCEL_PROJECT_NAME
```

Both deployment commands require an existing valid `.vercel/project.json` and
never auto-link or create a Vercel project. They pull and validate the exact
target environment, pin every Vercel command to the linked project ID, require
a clean Git tree, and repeat the link/tree/artifact checks after building.
Production also requires Node 22 and exact confirmation matching the linked
Vercel project name or ID. Neither command
publishes Firestore data, provisions remote users, deploys Firestore Rules, or
runs `gcloud`; those remain separate audited operator workflows.

Before the deployment commands, `.vercelignore` prevents local env files,
generated data, source workbooks, logs, and common credential files from being
uploaded. The helper also rejects tracked sensitive artifacts independently.

Then verify:

- signed-out visitors see only the Access Gate;
- an invalid, expired, wrong-audience, unverified, absent, disabled, or
  wrong-role Google account cannot create a session;
- session cookies are HttpOnly, Secure, SameSite=Strict, browser-session-only,
  and cleared by logout;
- every unauthenticated API request is denied with a stable error and
  `Cache-Control: private, no-store`;
- an authorized account loads all three streams, sees the permanent synthetic
  banner, and refreshes only when requested;
- a manifest change during pagination produces a restart rather than mixed
  records;
- direct browser Firestore reads and every browser write fail;
- `/api/chat` enforces role, roster, request size, privacy budget, rate limits,
  provider fallback, and no-store responses;
- browser bundles and network responses expose no server secret;
- CSP, HSTS, `nosniff`, frame denial, referrer policy, permissions policy, COOP,
  CORP, and no-index headers are present.

Record the Vercel deployment URL and ID, commit, Firestore project, manifest
version/update time, rules release, OAuth origins, WIF principal, IAM review,
and smoke-test result.

## 9. Rollback

Application rollback and data rollback are independent:

- Roll back application code with Vercel's deployment rollback only after
  confirming the older code supports schema v2 and the current APIs.
- Roll back data by selecting a previously validated immutable synthetic
  version. Re-verify all three stream counts, schema v2, synthetic
  classification, and checksum. With one active operator and an update-time
  precondition, change only `monitoringManifests/current` to that version and
  record a new `publishedAt`. Never copy records into the old version or mutate
  it in place.

After a manifest rollback, active clients should receive
`dataset-version-changed`, discard buffered/current data, and load the selected
version atomically. Repeat the signed-out, authorized-load, refresh, chat, and
header smoke tests. If the previous candidate cannot be revalidated, keep the
current manifest and roll forward with a new immutable `demo-*` version.
