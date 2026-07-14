# Deployment runbook

## 1. Prepare the Firebase project

1. Create or select the intended Firebase project and web app.
2. Initialize the Firestore database in the approved region before loading any
   sensitive records. Treat location and data residency as a design decision:
   changing them later requires a controlled migration.
3. Enable Google sign-in in Firebase Authentication.
4. Add the production and approved test hosts to Authorized domains.
5. Create the top-level `students`, `logs`, and `assessments` collections using
   separately authorized administrative tooling.
6. Use `.env.example` as the remote build template and replace every
   placeholder for that project. Never reuse the development emulator file.

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

## 5. Deploy rules and hosting together

```sh
npx --yes firebase-tools@14.23.0 deploy \
  --only firestore:rules,hosting \
  --project YOUR_PROJECT_ID
```

Use CI or an authenticated operator with the least Firebase permissions needed
for this deployment. Keep `--project` explicit; the tracked default is a demo
project so an accidental unqualified production deploy fails. Do not deploy
from an unreviewed working tree.

## 6. Post-deployment verification

Verify all of the following:

- signed-out users see only the access gate;
- an ordinary verified user and an unverified claimed user are denied;
- clinician and admin users can read all three workflows;
- create, update, and delete attempts remain denied;
- invalid/truncated data pauses analytics;
- an initial cache-only snapshot never reaches analytics and missing server
  verification fails closed after 15 seconds;
- an offline/cache-only transition pauses analytics, and reconnecting recovers
  only after another server-confirmed snapshot;
- the displayed last-verified time is treated as point-in-time transport
  evidence, while source observation age is checked against the operational
  freshness SLA;
- App Check requests are valid before enforcement;
- sign-out returns to the access gate and disconnects listeners;
- response headers include CSP, HSTS, `nosniff`, frame denial, referrer policy,
  permissions policy, COOP, and CORP.

Example header check:

```sh
curl -sSI https://YOUR_HOST/ | sed -n '1,40p'
```

Record the deployed commit, Firebase project, operator, rules version, and
verification result in the deployment audit trail.
