# ADR 0001: Privileged read-only access

- Status: Accepted
- Date: 2026-07-14

## Context

The dashboard presents sensitive clinical monitoring data. A hidden UI or a
Firebase API key cannot authorize access, and client write capability would
allow evidence or fixtures to alter production records.

## Decision

Require Firebase Authentication, a verified email, and an exact custom claim
`sentinelRole` equal to `clinician` or `admin`. Repeat this decision in
Firestore Security Rules. Permit reads only for the three declared top-level
collections and deny every client write and unknown path.

The client access gate is UX. Rules are the authorization source of truth.

## Consequences

- Claim provisioning and revocation require separate audited Admin SDK tooling.
- Even `admin` is read-only in this browser application.
- Rules tests are a release gate.
- New collections are denied until explicitly reviewed and tested.
