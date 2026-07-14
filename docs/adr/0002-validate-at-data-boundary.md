# ADR 0002: Validate at the data boundary

- Status: Accepted
- Date: 2026-07-14

## Context

Authorized Firestore records can still be malformed, stale, unexpected, or
hostile. Letting screens coerce values independently creates inconsistent
analytics and prototype-sensitive keys.

## Decision

Decode every snapshot document before it enters application state. Accept only
plain objects, safe matching identifiers, strict calendar dates, real numeric
types, documented ranges, DASS assessment weeks `0/4/8/16`, resilience score
weeks `0/8/16`, bounded strings, and known fields. Require CD-RISC and GRIT
together at every resilience week and require both to be absent at week 4. Do
not coerce numeric strings. Quarantine invalid records and mark the entire data
state degraded so analytics fail closed.

## Consequences

- One validation Module has high Leverage across every screen.
- Invalid source data is visible as a count but its raw content is not exposed.
- Adding a field requires an explicit decoder and test change.
- Availability yields to correctness when a stream contains invalid data.
