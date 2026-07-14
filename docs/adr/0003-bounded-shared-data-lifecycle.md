# ADR 0003: Bounded shared data lifecycle

- Status: Accepted
- Date: 2026-07-14

## Context

React-level listeners were easy to duplicate during remounts, could load
unbounded collections, and made it difficult to clear sensitive state after
the dashboard closed.

## Decision

Use a framework-independent monitoring store with a small subscription
Interface. The first subscriber starts one Adapter connection; the final
unsubscribe closes every listener and clears state. Query each stream with a
hard limit plus one sentinel record. Surface connecting, ready, degraded, and
error states with point-in-time verification metadata.

Subscribe to Firestore metadata changes and allow only snapshots explicitly
confirmed by the server with no pending local writes. Reject cache-only and
latency-compensated snapshots before decoding, require initial committed
server confirmation within 15 seconds, and fail closed on a later unverified
transition. Timestamp only accepted server snapshots; do not treat that
timestamp as an independent heartbeat or as source-observation age.

Once all streams are loaded, require every log and assessment `studentId` to
resolve to a student in the same dataset. Treat any orphan as a dataset issue
and pause analytics until a coherent reference appears.

Keep Firebase behind an Adapter Seam and use an in-memory Adapter in tests.

## Consequences

- StrictMode-style remounts do not leak listeners or records.
- Truncation pauses analytics instead of silently dropping data.
- Cached snapshots cannot be presented as newly server-verified data.
- Recovery requires another server-confirmed snapshot.
- The data Module has greater Depth while screens remain shallow consumers.
- Limits must be reviewed as operational capacity changes.
