# ADR 0005: Clinical browser data scope

- Status: Accepted
- Date: 2026-07-14

## Context

Individual tracking requires raw student, observation, and assessment records.
Any record delivered to a browser can be inspected by that authorized user,
regardless of minification or UI restrictions. A future population-only user
would not need this scope.

## Decision

Expose the three raw collections only to verified `clinician` and `admin`
roles whose work requires individual detail. Do not define a general viewer
role. Load Firestore and dashboard code only after that authorization succeeds.

If a population-only role is required, create non-identifying aggregates on a
trusted backend and authorize a separate aggregate collection. Do not grant the
new role access to the existing raw collections.

## Consequences

- Authorized clinical users can inspect records present in browser memory.
- Managed-device and role-governance controls remain operational requirements.
- Code splitting reduces pre-auth exposure and cost but is not authorization.
- Broader readership requires backend work and a new reviewed ADR.
