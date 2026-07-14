# ADR 0004: Central monitoring analytics

- Status: Accepted
- Date: 2026-07-14

## Context

Population, room, and individual screens previously mixed storage traversal,
LOCF, statistics, alert rules, and rendering. That structure made domain drift
and cross-student carry-forward defects likely.

## Decision

Put domain transformations behind `createMonitoringAnalytics()`. Deduplicate
deterministically, apply Buddy and Command LOCF chronologically within one
student only, calculate sample statistics, classify alerts from latest valid
observations, and prevent historical room views from selecting future
assessments.

Expose screen-shaped projections through a small Interface. Keep the Module
free of React and Firebase.

## Consequences

- Domain invariants are tested once and reused with high Leverage.
- Screens own presentation state with strong Locality.
- Changes to clinical thresholds require domain review and tests.
- Analytics remain synchronous; materially larger data should move to a
  controlled backend rather than expanding browser limits indefinitely.
