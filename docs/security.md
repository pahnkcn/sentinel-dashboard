# Security model

## Protected assets

Student identifiers, names, rooms, demographics, health details, observation
levels, assessment scores, and drawing notes are sensitive. Custom claims and
administrative credentials are privileged security data. Availability and
freshness also matter because partial or future-leaking data can produce unsafe
monitoring decisions.

Only a broad, multi-metric population-overview narrative with at least one
usable cohort trend is model-backed. For that route, the server may transmit
only qualitative directions for available metrics to OpenRouter and its
selected model provider. Exact scores, counts, dates, identifiers, alert
status, missing-data status, and narrative fields are withheld. Individual,
people-ranking, room, coverage, latest-value, comparison, forecast, chart,
table, causal, and small-cohort requests stay on deterministic server routes.
Even qualitative population facts can remain sensitive when combined with
outside information. Zero Data Retention reduces provider retention; it does
not mean that data stays inside Firebase. Deployment owners must approve that
processing and the applicable data-residency, contractual, and clinical
policies before enabling the Function with real records.

## Trust boundaries

1. The browser and all Firestore documents are untrusted inputs.
2. Firebase Authentication establishes identity; a verified ID-token claim
   supplies the clinical role.
3. Firestore Security Rules are the authorization boundary for browser reads.
   The chat Function uses the Admin SDK, which bypasses those Rules, so its
   exact manifest, path, stream, and record-count allowlists form a separate
   privileged server boundary.
4. Strict decoders and referential-integrity checks are the data-shape boundary
   for both browser and server retrieval.
5. The analytics Module is the domain-rule boundary.
6. The authenticated Cloud Function validates the browser-visible dataset
   version, classifies the current question, and is the OpenRouter credential
   and outbound disclosure boundary.
7. The privacy compiler produces a fixed local policy response, a deterministic
   derived response, or a canonical broad aggregate task with qualitative
   trend directions. Model output remains untrusted until its three-field schema,
   entity tokens, and absence of digits pass server validation. The server then
   merges exact deterministic evidence; validation or provider failure selects
   the precomputed deterministic fallback.

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
| Client-forged AI context | `/api/chat` accepts only the current question and expected safe dataset version; client-supplied messages, context, records, and extra fields are rejected |
| Stale or mixed AI source data | The Function reads the exact current manifest, loads bounded known streams, decodes every record, checks references, re-reads the manifest after loading, and rejects a browser/server version mismatch |
| Unauthorized AI access | Function verifies ID token, verified email, exact clinical role, App Check, request method, question size, and request rate |
| Unnecessary provider calls | Individual, people-ranking, room, coverage, latest-value, week-comparison, forecast, chart, table, causal, explicit-metric overview, privacy/safety/clarification, and small-cohort requests return deterministic or fixed local-only responses with zero OpenRouter calls |
| Excessive AI disclosure | Only a broad multi-metric population narrative with at least one usable cohort trend can reach the model; the raw question becomes a canonical task; facts contain only qualitative directions for available metrics; exact scores, counts, dates, identifiers, alerts, missing-data status, and narrative fields are absent; and the full dynamic outbound disclosure is capped at 1,536 UTF-8 bytes |
| Direct identity disclosure to the model | Individual, people-ranking, and room facts never enter the model route; the qualitative population payload contains no student or room identifiers |
| Unexpected model routing | The Function accepts only `z-ai/glm-5.2`, requires one exact reviewed provider slug, disables OpenRouter provider fallback, and requires structured-output parameters; a missing or malformed provider setting fails closed before egress |
| Provider retention or training | Every model-backed request requires `data_collection: "deny"` and `zdr: true`; deployment policy must also keep OpenRouter input/output logging and data-discount sharing disabled |
| Provider, credit, timeout, or invalid model output | A deterministic broad-overview payload is prepared before egress and returned when the key/configuration is unavailable, the provider or credit fails, the request times out, or schema/disclosure validation fails; response metadata distinguishes whether an external request was attempted |
| Hallucinated or unsafe output | The model schema permits only `answer`, `confidence`, and `followUps`, output is limited to 800 tokens, digits and undisclosed entity tokens are rejected, exact deterministic highlights/coverage/method are merged only after validation, and no write/action tools exist |

Unit tests cover claim classification, safe Auth error reporting, hosting
headers, decoding, server-snapshot verification, subscription lifecycle,
analytics, server-side dataset retrieval, the deterministic/model routing
matrix, application-fallback behavior, disclosure canaries, cohort suppression,
no-data routing, and model-output disclosure validation. Emulator tests
cover protected reads, all writes, unknown collections, and nested
subcollections.

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
- Approve `z-ai/glm-5.2` and the exact provider endpoint pinned by
  `OPENROUTER_PROVIDER`. Re-run the review if the model, routing policy, or
  provider terms change.
- Keep OpenRouter input/output logging and data-discount sharing disabled,
  enforce a key credit limit, review usage metadata, and rotate the key under
  the incident procedure.

## Residual constraints

- Sensitive records remain in memory while an authorized dashboard is open.
- The chat Function loads and caches the current raw dataset in privileged
  server memory. Its repository uses the Admin SDK and therefore relies on
  reviewed exact-path code, bounded reads, decoders, IAM, and the immutable
  manifest contract rather than Firestore Security Rules.
- Fixed-policy and deterministic-derived routes do not call OpenRouter. The
  broad multi-metric population-narrative route does send qualitative
  directions for available metrics outside Firebase to OpenRouter and the
  configured provider. ZDR does not remove the need for legal,
  organizational, and provider review.
- A deterministic application fallback can be returned after an external
  request was attempted—for example after a timeout or invalid schema. It
  preserves the user experience but cannot retract data already transmitted.
  Operators must use the response's `externalRequestAttempted` privacy field
  when evaluating egress.
- The disclosure policy blocks known direct identifiers and designated
  narrative fields, keeps small cohorts and no-data summaries local, and
  withholds every alert and missing-data status. The remaining qualitative
  directions can still be sensitive when combined with outside knowledge.
- Structured-output and grounding checks reduce hallucination; they do not make
  model text clinically correct or replace review by qualified staff.
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
- Admin SDK tooling and the chat repository bypass Security Rules. Dataset
  publication therefore requires an audited least-privilege importer,
  immutable versions, backups, and a single-publisher transaction or
  precondition on the manifest; the Function requires least-privilege IAM and
  must retain its exact-path, strict-decoder, and double-manifest checks.
- A complete set of server-confirmed snapshots proves that the manifest-pinned
  dataset was current at the shown verification time. The client has no
  independent application heartbeat; Firestore metadata detects
  cache-delivered snapshots, while source-record age must be governed by the
  operational freshness SLA.
- This repository does not claim compliance with a specific regulatory regime;
  deployment owners must complete the required legal and organizational review.
