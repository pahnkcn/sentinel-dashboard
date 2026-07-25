# Security model

## Protected assets

Student identifiers, names, rooms, demographics, health details, observation
levels, assessment scores, and drawing notes are sensitive. Custom claims and
administrative credentials are privileged security data. Availability and
freshness also matter because partial or future-leaking data can produce unsafe
monitoring decisions.

Sentinel Analyst may transmit a question-specific subset of this sensitive data
to OpenRouter and its selected model provider. Deployment owners must approve
that processing and the applicable data-residency, contractual, and clinical
policies before enabling the Function in a real environment.

## Trust boundaries

1. The browser and all Firestore documents are untrusted inputs.
2. Firebase Authentication establishes identity; a verified ID-token claim
   supplies the clinical role.
3. Firestore Security Rules are the server-enforced authorization boundary.
4. Strict decoders are the data-shape boundary.
5. The analytics Module is the domain-rule boundary.
6. The authenticated Cloud Function is the OpenRouter credential and outbound
   AI boundary; model output is untrusted presentation data.

## Implemented controls

| Risk | Control |
| --- | --- |
| Public or ordinary-user access | Verified email plus exact `clinician`/`admin` custom claim in client and rules |
| Client mutation or fixture injection | All Firestore client writes denied; no runtime seeder |
| Future collections inheriting access | Rules authorize only the exact current manifest and three declared collections under its selected version |
| Malformed or prototype-sensitive records | Strict decoders, safe IDs, known fields, quarantine |
| Orphan logs or assessments | Post-load referential-integrity checks degrade the whole dataset until every `studentId` resolves |
| Partial or unbounded data | Bounded listeners; truncation and invalid records pause analytics |
| Mixed collection generations | Manifest-pinned immutable versions; three streams buffer behind one atomic replacement Interface; same-version mutation fails closed |
| Derived or future observations changing current decisions | Population statistics and alerts use observed values only; LOCF stays presentation-only; logs after the local as-of date are withheld |
| Cached or stale data after connection loss | Cache-only snapshots are rejected; initial server verification times out after 15 seconds; later cache transitions and stream errors pause analytics; the exact last server-confirmed time remains visible |
| Latency-compensated local writes | Snapshots with `hasPendingWrites` are rejected and pause analytics until Firestore emits a committed server snapshot |
| Sensitive data retained after sign-out | Last subscriber disconnect clears the shared store |
| Privileged sign-in retained on a shared workstation | Auth uses session storage rather than Firebase's local-persistence default; closing the tab or browser clears the saved session |
| Application errors reflected to users or logs | Generic screen UI, bounded Auth codes, fixed React failure categories |
| Cross-site script and framing attacks | Hosting CSP, frame denial, MIME sniffing protection, HSTS, permissions policy |
| Unnecessary pre-auth code/data path | Dashboard, Firestore, and charts load only after authorization |
| Automated abuse | Required reCAPTCHA Enterprise App Check for remote builds and CSP support |
| Accidental local access to live data | No fallback config; Vite `command`/`isPreview`, not user-selectable mode names, force every actual dev server to localhost emulators |
| OpenRouter key exposure | Secret Manager-bound Function secret; no `VITE_*` key and no direct browser request |
| Unauthorized AI access | Function verifies ID token, verified email, exact clinical role, App Check, request method, body size, and request rate |
| Excessive AI disclosure | Question-aware context defaults to aggregates; Fusion receives per-request subject aliases, no names/IDs, and no sensitive demographic/drawing free text |
| Provider retention or training | Every request requires `data_collection: "deny"` and `zdr: true`; deployment policy must also keep OpenRouter input/output logging disabled |
| Hallucinated or unsafe output | Fusion deliberation is treated as untrusted evidence; a separate strict-schema formatter checks it against verified context before server normalization |

Unit tests cover claim classification, safe Auth error reporting, hosting
headers, decoding, server-snapshot verification, subscription lifecycle, and
analytics. Emulator tests cover protected reads, all writes, unknown
collections, and nested subcollections.

## Clinical browser scope

An authorized clinician or administrator can inspect data already delivered to
their browser using developer tools. Code obfuscation cannot prevent this.
Therefore the application grants no broad `viewer` role: only roles whose job
requires individual clinical detail may read the current versioned collections.

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
- Deploy and verify restrictive Firestore Rules before any sensitive Admin SDK
  import, publish the current manifest last, and deploy Hosting separately.
- Configure backups, retention, audit logging, and incident procedures for the
  source data outside this read-only client.
- Define and monitor a business freshness SLA using source observation times;
  transport verification alone does not prove that upstream observations were
  entered on schedule.
- Use managed devices and avoid shared browser profiles for clinical access.
- Complete privacy, data-processing, residency, model-provider, and clinical
  safety review before enabling Sentinel Analyst with real records.
- Keep OpenRouter input/output logging and data-discount sharing disabled,
  enforce a key credit limit, review usage metadata, and rotate the key under
  the incident procedure.

## Residual constraints

- Sensitive records remain in memory while an authorized dashboard is open.
- De-identified numeric records and room summaries leave the Firebase
  environment for the Fusion panel; the formatter receives relevant original
  context. ZDR and aliases reduce risk but do not remove the need for legal,
  organizational, and provider review.
- Fusion exposes web-search and web-fetch tools to panel and judge calls. The
  prompt forbids their use for this closed dataset, but that instruction is not
  a security boundary; identity removal before Fusion is the compensating
  control.
- The in-memory request limiter is an abuse guard, not a globally exact quota;
  set OpenRouter key budgets and platform-level controls as the cost boundary.
- Session persistence limits saved Auth state to the current tab, but it is not
  an inactivity timeout. Staff must lock managed devices and close the tab or
  sign out when leaving the workstation.
- Removing a claim and revoking refresh tokens prevents future valid sessions,
  but an already-issued ID token can remain usable until it expires. For an
  emergency, deploy a temporary Security Rules deny for the affected UID—or
  deny all reads—then keep it until token expiry and revocation are verified.
- `style-src 'unsafe-inline'` remains because the chart and utility styling use
  inline styles. Script execution does not allow `unsafe-inline` or
  `unsafe-eval`.
- App Check reduces abuse from unregistered clients but does not replace Auth,
  Security Rules, or role review.
- Admin SDK tooling bypasses Security Rules. Dataset publication therefore
  requires an audited least-privilege importer, immutable versions, backups,
  and a single-publisher transaction or precondition on the manifest.
- A complete set of server-confirmed snapshots proves that the manifest-pinned
  dataset was current at the shown verification time. The client has no
  independent application heartbeat; Firestore metadata detects
  cache-delivered snapshots, while source-record age must be governed by the
  operational freshness SLA.
- This repository does not claim compliance with a specific regulatory regime;
  deployment owners must complete the required legal and organizational review.
