# ADR 0004: Central monitoring analytics

- Status: Accepted
- Date: 2026-07-14

## Context

Population, room, and individual screens previously mixed storage traversal,
LOCF, statistics, alert rules, and rendering. That structure made domain drift
and cross-student carry-forward defects likely.

## Decision

Put domain transformations behind `createMonitoringAnalytics()`. Deduplicate
deterministically, calculate population statistics and alerts from observed
values only, and exclude logs after the explicit local-date as-of cutoff.
Apply Buddy and Command LOCF chronologically within one student only for
labeled presentation continuity. Prevent historical room views from selecting
future assessments. Select DASS and resilience results independently so a
DASS-only week 4 record cannot mask the latest valid CD-RISC and GRIT scores;
retain the source week in the projection.

For weekly population statistics, average each student's observed daily values
within the week before calculating the cohort mean and sample SD. Return `N`
per metric and no SD when fewer than two students contribute. This prevents
students with more daily records from receiving more cohort weight.

Expose screen-shaped projections through a small Interface. Keep the Module
free of React and Firebase.

## Consequences

- Domain invariants are tested once and reused with high Leverage.
- Screens own presentation state with strong Locality.
- Changes to clinical thresholds require domain review and tests.
- Analytics remain synchronous; materially larger data should move to a
  controlled backend rather than expanding browser limits indefinitely.
