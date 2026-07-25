# Deployment runbook

## 1. Prepare the Firebase project

1. Create or select the intended Firebase project and web app.
2. Initialize the Firestore database in the approved region before loading any
   sensitive records. Treat location and data residency as a design decision:
   changing them later requires a controlled migration.
3. Enable Google sign-in in Firebase Authentication.
4. Add the production and approved test hosts to Authorized domains.
5. Do not create or import sensitive documents yet. Keep Firestore empty, or
   behind a reviewed deny-all maintenance rule, until the target Security
   Rules deployment has succeeded and its access probes pass.
6. Use `.env.example` as the remote build template and replace every
   placeholder for that project. Never reuse the development emulator file.
7. Create an OpenRouter key dedicated to this deployment, set a credit limit,
   and keep input/output logging and data-discount sharing disabled.

Never put a service-account key, Admin SDK credential, or other secret in a
`VITE_*` variable. Vite embeds those values in public browser assets.

## 2. Provision staff claims

Use audited server-side Admin SDK tooling. Preserve unrelated custom claims
when assigning a role:

```js
const user = await getAuth().getUser(uid);
await getAuth().setCustomUserClaims(uid, {
  ...user.customClaims,
  sentinelRole: 'clinician', // or 'admin'
});
```

Only the exact values `clinician` and `admin` are accepted. The user must sign
out and back in, or otherwise refresh the ID token, after a change.

Removing the claim and revoking refresh tokens does not invalidate an ID token
that was already issued. During an emergency, first deploy a temporary
Firestore rule that denies the affected UID—or denies all protected reads—then
remove the claim, revoke refresh tokens, terminate known sessions, and keep the
temporary deny until the old token has expired and access tests confirm denial.
Review and test the final rule before restoring normal service.

Do not add client-side claim management to this repository.

This release changes Firebase Auth from its browser-local default to
tab-scoped session persistence. Before rollout over an older deployment,
revoke legacy refresh tokens according to the incident policy and require
staff to close old tabs or clear the site's stored data. The new client does
not load a locally persisted user into the authorized dashboard.

## 3. Configure App Check

1. Register the web app with a reCAPTCHA Enterprise score-based site key.
2. Restrict the key to approved production and test domains.
3. Set `VITE_FIREBASE_APPCHECK_SITE_KEY` during every remote build.
4. Deploy and verify App Check request metrics.
5. Enable enforcement for Cloud Firestore only after legitimate traffic is
   receiving valid tokens.

App Check may be empty only for the forced localhost emulator environment. A
remote build without a site key fails. After Firestore enforcement is enabled,
remote clients without a valid token are rejected. App Check is an abuse
signal, not an authorization mechanism.

## 4. Pre-deployment gate

```sh
npm ci
npm ci --prefix functions
npm test
npm run test:rules
npm run lint
npm run build
npm audit --audit-level=high
```

Stop if any command fails, if a production chunk exceeds the configured build
warning, or if the rules suite cannot start its emulator. The emulator test may
download the pinned Firebase CLI on its first run.

The production Hosting policy sends HSTS for two years with
`includeSubDomains; preload`. Before deploying it, inventory every current and
planned subdomain of the host and confirm it is permanently HTTPS-capable. Do
not submit the domain to the browser preload list without organizational
approval. If that guarantee cannot be made, reduce the HSTS policy and update
its regression test before deployment.

## 5. Deploy and verify Firestore rules

```sh
npx --yes firebase-tools@14.23.0 deploy \
  --only firestore:rules \
  --project YOUR_PROJECT_ID
```

Use CI or an authenticated operator with the least Firebase permissions needed
for this deployment. Keep `--project` explicit; the tracked default is a demo
project so an accidental unqualified production deploy fails. Do not deploy
from an unreviewed working tree.

Deploy and verify the restrictive rules before every sensitive administrative
import. Do not combine this command with Hosting: a multi-service Firebase
deployment is not an atomic transaction, and its internal service order cannot
serve as a security prerequisite.

Confirm the deployed release matches the reviewed `firestore.rules` and run
access probes against the target project. Before publication, signed-out,
ordinary verified, and unverified clinician accounts must be unable to read the
manifest or records; every browser role must be unable to create, update, or
delete. The emulator suite is the release gate for exact-current-manifest,
current-version, manifest-list, inactive-version, unknown-path, and nested-path
behavior. Record the project, rules release, operator, and timestamp before
continuing.

## 6. Publish one immutable dataset

Use separately deployed, audited Admin SDK tooling with a least-privilege
credential. Admin SDK access bypasses Firestore Security Rules, so the importer
is a privileged production system and must have its own review, logs, backups,
and incident controls.

1. Generate a unique safe version matching
   `[A-Za-z0-9][A-Za-z0-9._-]{0,127}`.
2. Write the complete candidate to these new paths, preserving stable logical
   document IDs within the isolated version:
   - `monitoringDatasets/{version}/students/{studentId}`
   - `monitoringDatasets/{version}/logs/{logId}`
   - `monitoringDatasets/{version}/assessments/{assessmentId}`
3. Wait for every write to commit, then re-read the candidate. Validate strict
   schemas, score ranges, assessment schedules, deterministic duplicate keys,
   collection limits, and that every log and assessment references a student
   in the same version.
4. Reconcile counts and checksums with the approved source. Stop and quarantine
   or delete the unpublished candidate if any check fails.
5. In a transaction or with an equivalent last-update precondition, write
   `monitoringManifests/current` as `{ version: "THE_VERSION" }`. This must be
   the final publish operation, with one active publisher.
6. Never mutate a published version. Retain the previous immutable version
   according to policy until production verification succeeds; rollback is a
   preconditioned manifest change to a previously validated version.

Creating a candidate without changing the manifest must not affect the live
dashboard. The final manifest change makes only the selected version readable
through Security Rules, and the client still waits for all three verified
streams before replacing state.

For an existing pre-manifest deployment, schedule a maintenance window. Deploy
and verify a temporary deny-all rule first, deploy the version-aware Hosting
release separately, import and validate the candidate, publish its manifest,
then deploy and verify the final role rules before reopening access. This
sequence deliberately makes legacy top-level clients fail closed and prevents
old tabs from observing a mixed migration.

## 7. Configure and deploy Sentinel Analyst Function

Store the provider credential in Firebase Secret Manager. Never put it in a
`VITE_*` variable, `.env.example`, Hosting config, or client code:

```sh
npx --yes firebase-tools@14.23.0 functions:secrets:set OPENROUTER_API_KEY \
  --project YOUR_PROJECT_ID
```

Set `OPENROUTER_MODEL` and `OPENROUTER_SITE_URL` as Functions string
parameters when prompted during deployment, or in the reviewed project-specific
Functions environment configuration. The default model is
`google/gemini-3.6-flash`. Before each release, confirm the configured model
still supports strict structured output and has an endpoint available under
Zero Data Retention routing.

Deploy the Function and verify signed-out, wrong-role, missing-App-Check,
invalid-body, rate-limit, provider-failure, and authorized success paths:

```sh
npx --yes firebase-tools@14.23.0 deploy \
  --only functions:sentinelChat \
  --project YOUR_PROJECT_ID
```

Do not enable the chatbot with real records until the organization approves
OpenRouter and underlying provider processing. Confirm the OpenRouter account
does not enable input/output logging or data-discount sharing and that the
dedicated key has an appropriate budget.

## 8. Deploy Hosting separately

```sh
npx --yes firebase-tools@14.23.0 deploy \
  --only hosting \
  --project YOUR_PROJECT_ID
```

Deploy Hosting only after the rules release is verified and the manifest
selects a fully validated dataset. Record the Hosting release separately from
the rules release.

## 9. Post-deployment verification

Verify all of the following:

- signed-out users see only the access gate;
- an ordinary verified user and an unverified claimed user are denied;
- clinician and admin users can read all three workflows;
- clinician and admin users can get only `monitoringManifests/current`; listing
  manifests and reading candidate or retired versions remains denied;
- closing the signed-in tab or browser requires authentication in a new
  session;
- create, update, and delete attempts remain denied;
- invalid/truncated data pauses analytics;
- an initial cache-only snapshot never reaches analytics and missing server
  verification fails closed after 15 seconds;
- an offline/cache-only transition pauses analytics, and reconnecting recovers
  only after another server-confirmed snapshot;
- a snapshot with pending local writes pauses analytics and cannot update the
  last-verified time;
- staging a candidate without changing the manifest leaves the current UI
  unchanged, while a manifest transition clears the old version and publishes
  all three new streams together only after full verification;
- mutating any stream under the published version fails closed;
- the displayed last-verified time represents full-dataset transport
  verification, while source observation age is checked against the
  operational freshness SLA;
- App Check requests are valid before enforcement;
- the OpenRouter key is absent from browser assets and network responses;
- `/api/chat` rejects missing/invalid Auth and App Check, accepts only
  clinician/admin users, and returns `Cache-Control: no-store`;
- chat input stays disabled until the verified dataset is ready and while one
  response is in flight;
- aggregate questions omit student detail, specific questions retrieve only
  relevant detail, and future-dated records remain withheld;
- text, table, graph, prediction, provider error, and clear-conversation flows
  behave as reviewed;
- each successful question produces one OpenRouter generation and returns the
  strict UI schema;
- sign-out returns to the access gate and disconnects listeners;
- response headers include CSP, HSTS, `nosniff`, frame denial, referrer policy,
  permissions policy, COOP, and CORP.

Example header check:

```sh
curl -sSI https://YOUR_HOST/ | sed -n '1,40p'
```

Record the deployed commit, Firebase project, operator, dataset version, rules
release, Hosting release, and verification result in the deployment audit
trail.
