# Security model

## Deployment classification

The Vercel Hobby deployment is a personal, non-commercial demonstration that
may contain only synthetic data. `dataClassification` must equal `synthetic`,
all monitoring record identifiers must use the `demo-*` namespace, and the UI permanently
labels the dataset as demonstration data. Real student, clinical, operational,
or re-identifiable data is outside this deployment profile.

Hobby Standard Deployment Protection covers previews, not the production
domain. The application access gate is therefore mandatory in production but
is not a substitute for an approved private hosting plan when real data is in
scope.

## Trust boundaries

1. The browser, query parameters, cookies, Google credential POST, Firestore
   documents, workbook, and model output are untrusted inputs.
2. Google Identity Services establishes account identity; the Firestore
   `authorizedUsers` document grants the Sentinel role.
3. The signed HttpOnly session cookie authenticates same-origin API calls.
4. Vercel OIDC plus GCP Workload Identity Federation authenticates runtime
   Firestore reads without a stored private key.
5. The runtime service account's `roles/datastore.viewer` grant is the database
   authorization boundary. Firestore Rules deny every browser client.
6. Strict record decoders and the atomic HTTP adapter are the data boundary.
7. The Vercel chat function is the provider-secret and outbound-AI boundary.
8. Operator ADC is a separate privileged boundary for allowlist and dataset
   writes; it is never available to the Vercel runtime.

## Implemented controls

| Risk | Control |
| --- | --- |
| Browser reads or writes Firestore directly | Firebase Web SDK removed; deny-all Firestore Rules cover every path and authenticated state |
| Long-lived cloud credential leak | Vercel OIDC is exchanged through GCP WIF for short-lived credentials; no service-account JSON key |
| Preview deployment reaches production data | WIF principal is restricted to the exact production Vercel OIDC subject; Preview has no production binding |
| Unauthorized staff access | GIS token and CSRF verification, verified email, hashed allowlist lookup, exact `clinician`/`admin` role |
| Session theft or persistence | `__Host-` cookie, HttpOnly, Secure, SameSite=Strict, no Domain/Path override, eight-hour maximum, browser-session lifetime |
| Cross-site script or framing | CSP limited to same origin and GIS, frame denial, MIME sniffing protection, HSTS, referrer and permissions policies |
| Stale or mixed dataset | Manifest-pinned pagination, manifest recheck, rollover `409`, atomic client publication, no cache |
| Unbounded server response | Fixed stream page sizes below the Vercel Function response limit and opaque bounded page tokens |
| Sensitive source workbook leakage | Read-only local input; only aggregate profile retained; synthetic output validates generic identities and excludes source dates/trajectories |
| Accidental remote import | Publisher defaults to dry-run and requires explicit project, `demo-*` version, and `--commit`; records use `exists: false`; manifest changes last |
| Runtime data mutation | Runtime service account has `roles/datastore.viewer` only; publisher and allowlist tool require operator ADC |
| AI credential exposure | OpenRouter key is server-only and never Vite-prefixed |
| Excessive AI disclosure | Existing allowlisted evidence schema, roster redaction, aggregation threshold, alias remapping, body limit, and deterministic local answers |
| Abuse and cost spikes | App-level endpoint/provider limits, OpenRouter key budget, and a Vercel WAF rate rule for `/api/chat` |

Every API response containing authentication or monitoring state must set
`Cache-Control: private, no-store`. Errors return stable public codes and do not
reflect token, Firestore, provider, or credential detail.

## Identity configuration

Use one Google OAuth web client with only reviewed JavaScript origins:

- the exact localhost development origin;
- the production custom domain;
- one stable staging origin if staging is required.

Do not register wildcard Vercel preview domains with Google OAuth. GIS login
must compare the `g_csrf_token` cookie with the submitted value before token
verification. The server verifies Google's signature, issuer, audience,
expiry, email, and `email_verified` claim.

Allowlist documents use
`authorizedUsers/{sha256(normalizedLowercaseEmail)}` and contain only `email`,
`role`, `enabled`, and an operator timestamp. Disable a user rather than deleting
the record so the state remains auditable. Rotate `SESSION_SECRET` to invalidate
all sessions after suspected compromise.

## Cloud IAM configuration

Use Vercel's team issuer mode. The workload identity provider maps
`google.subject=assertion.sub`, restricts the allowed audience to the exact
Vercel team, and accepts only the subject:

```text
owner:TEAM_SLUG:project:PROJECT_NAME:environment:production
```

Grant that subject `roles/iam.workloadIdentityUser` on a dedicated service
account. Grant the service account only `roles/datastore.viewer` on the
Firestore project. Do not bind `preview`, a wildcard pool principal, or the
whole Vercel team to the runtime service account.

The operator identity used by the two administrative scripts must be distinct,
audited, and granted only the Firestore write permissions required for
`monitoringDatasets`, `monitoringManifests`, and `authorizedUsers`. Do not grant
those permissions to the Vercel service account.

## Synthetic workbook boundary

The workbook parser accepts `.xlsx` files up to 25 MB and validates the required
five sheets and headers. It reads formulas only when a cached result is present;
uncached or errored formulas fail closed. Daily duplicate resolution,
zero-as-missing Buddy handling, canonical hidden Command source, score ranges,
and week mismatch quarantine are tested.

Generated JSON is written under `.generated/`, which Git ignores. Before any
commit publish, an operator must verify that the profile contains only
aggregates, all IDs/names/rooms are generic demo values, all dates are shifted
to the chosen end date, and no source workbook or generated JSON is staged.

## Residual constraints

- An authorized user can inspect records already delivered to the browser.
- Session expiry is not an inactivity timer; users must sign out and lock shared
  devices.
- Per-instance rate limits are not globally exact. Vercel WAF and provider
  budgets are required cost controls.
- OIDC removes stored GCP private keys but does not reduce the permissions of a
  successfully impersonated service account; IAM review remains mandatory.
- OpenRouter ZDR reduces retention but does not make provider processing
  appropriate for real clinical data under this Hobby profile.
- This repository does not claim compliance with any healthcare or privacy
  regulation.
