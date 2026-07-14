# Security model

## Protected assets

Student identifiers, names, rooms, demographics, health details, observation
levels, assessment scores, and drawing notes are sensitive. Custom claims and
administrative credentials are privileged security data. Availability and
freshness also matter because partial or future-leaking data can produce unsafe
monitoring decisions.

## Trust boundaries

1. The browser and all Firestore documents are untrusted inputs.
2. Firebase Authentication establishes identity; a verified ID-token claim
   supplies the clinical role.
3. Firestore Security Rules are the server-enforced authorization boundary.
4. Strict decoders are the data-shape boundary.
5. The analytics Module is the domain-rule boundary.

## Implemented controls

| Risk | Control |
| --- | --- |
| Public or ordinary-user access | Verified email plus exact `clinician`/`admin` custom claim in client and rules |
| Client mutation or fixture injection | All Firestore client writes denied; no runtime seeder |
| Future nested collections inheriting access | Rules authorize only one top-level document segment |
| Malformed or prototype-sensitive records | Strict decoders, safe IDs, known fields, quarantine |
| Partial or unbounded data | Bounded listeners; truncation and invalid records pause analytics |
| Cached or stale data after connection loss | Cache-only snapshots are rejected; initial server verification times out after 15 seconds; later cache transitions and stream errors pause analytics; the exact last server-confirmed time remains visible |
| Sensitive data retained after sign-out | Last subscriber disconnect clears the shared store |
| Application errors reflected to users or logs | Generic screen UI, bounded Auth codes, fixed React failure categories |
| Cross-site script and framing attacks | Hosting CSP, frame denial, MIME sniffing protection, HSTS, permissions policy |
| Unnecessary pre-auth code/data path | Dashboard, Firestore, and charts load only after authorization |
| Automated abuse | Required reCAPTCHA Enterprise App Check for remote builds and CSP support |
| Accidental local access to live data | No fallback config; development is forced to localhost emulators |

Unit tests cover claim classification, safe Auth error reporting, hosting
headers, decoding, server-snapshot verification, subscription lifecycle, and
analytics. Emulator tests cover protected reads, all writes, unknown
collections, and nested subcollections.

## Clinical browser scope

An authorized clinician or administrator can inspect data already delivered to
their browser using developer tools. Code obfuscation cannot prevent this.
Therefore the application grants no broad `viewer` role: only roles whose job
requires individual clinical detail may read the three collections.

If a population-only role is introduced, do not grant it these reads. Produce
server-side aggregate documents with a separate collection, claim, and ruleset
that cannot reconstruct individuals. See ADR 0005.

## Operational controls required outside this repository

- Provision and revoke `sentinelRole` only through audited Admin SDK tooling.
- Require strong organizational account security and review role membership.
- Restrict the Firebase web API key by approved HTTP referrers and APIs.
- Register allowed Auth and reCAPTCHA Enterprise domains.
- Set `VITE_FIREBASE_APPCHECK_SITE_KEY` for every remote build, validate App
  Check metrics, then enable Cloud Firestore enforcement in Firebase Console.
- Deploy `firestore.rules`; a hosting-only deploy is not sufficient.
- Configure backups, retention, audit logging, and incident procedures for the
  source data outside this read-only client.
- Define and monitor a business freshness SLA using source observation times;
  transport verification alone does not prove that upstream observations were
  entered on schedule.
- Use managed devices and avoid shared browser profiles for clinical access.

## Residual constraints

- Sensitive records remain in memory while an authorized dashboard is open.
- Removing a claim and revoking refresh tokens prevents future valid sessions,
  but an already-issued ID token can remain usable until it expires. For an
  emergency, deploy a temporary Security Rules deny for the affected UID—or
  deny all reads—then keep it until token expiry and revocation are verified.
- `style-src 'unsafe-inline'` remains because the chart and utility styling use
  inline styles. Script execution does not allow `unsafe-inline` or
  `unsafe-eval`.
- App Check reduces abuse from unregistered clients but does not replace Auth,
  Security Rules, or role review.
- A server-confirmed snapshot proves that the query was current at the shown
  verification time. The client has no independent application heartbeat;
  Firestore metadata detects cache-delivered snapshots, while source-record
  age must be governed by the operational freshness SLA.
- This repository does not claim compliance with a specific regulatory regime;
  deployment owners must complete the required legal and organizational review.
