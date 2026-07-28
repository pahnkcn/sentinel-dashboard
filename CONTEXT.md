# Sentinel Domain Context

## Scope

Sentinel is a read-only staff dashboard for monitoring mental-health and
physical-wellbeing observations during a 16-week training period. The runtime
is not a data-entry tool; synthetic fixture generation is a separate local-only
operator workflow.

## Domain vocabulary

- **Monitored student (นรม.)** — a person represented by a `students` record.
  The repository does not define the full Thai expansion of “นรม.”, so the
  abbreviation remains unexpanded.
- **Daily observation** — one `logs` record for one monitored student on one
  ISO calendar date.
- **Four Colors observation** — ordinal levels `1` through `4`, where a larger
  value represents a more concerning status.
- **Self, Buddy, Command** — the three Four Colors viewpoints. Self is observed
  daily. Buddy and Command may be absent on non-evaluation days.
- **LOCF (last observation carried forward)** — presentation-only continuity
  for missing Buddy and Command values. Carrying never crosses students and
  never invents a value before the first observation.
- **Assessment** — a scheduled `assessments` record containing DASS-21,
  CD-RISC, GRIT, and an optional drawing note.
- **Room status** — a date-specific view grouped by the monitored student's
  room. A historical view must not use an assessment from a later training
  week.
- **Clinical alert** — a dashboard classification derived from the latest
  valid observations. It is decision support, not a diagnosis.
- **Weekly population statistic** — each student's observed daily values are
  averaged within the week first, then each student contributes one equally
  weighted value to the cohort mean and sample SD. `N` is reported per metric;
  sample SD is unavailable when `N` is less than `2`.

## Record invariants

- Record IDs and student IDs are non-empty strings and must agree with their
  Firestore document IDs when both are present.
- Daily-observation dates use strict `YYYY-MM-DD` calendar dates.
- Training weeks are integers from `0` through `16`; daily observations use
  weeks `1` through `16`.
- Self, Buddy, and Command values are integers from `1` through `4` when
  observed; each may be null, but a log must contain at least one observed
  channel or physical-injury value. `selfObservedAt` is an ISO timestamp when
  Self is present.
- Physical-injury is nullable and mental-severity values are integers from `1`
  through `3`. Physical injury is never carried forward.
- DASS-21 dimension values are raw integer scores from `0` through `21`.
- CD-RISC values are numbers from `0` through `40`.
- GRIT values are numbers from `0` through `32`.
- DASS-21 is scheduled for weeks `0`, `4`, `8`, and `16`; CD-RISC and GRIT are
  required together at weeks `0`, `8`, and `16` and must be absent at week `4`.

## Security and trust

- Names, IDs, rooms, demographics, health details, scores, and drawing notes
  are sensitive data.
- Browser and API data remain untrusted and must be decoded before analytics or
  presentation.
- Firestore Security Rules deny every browser read and write. Vercel Functions
  read through a short-lived OIDC-federated service account with
  `roles/datastore.viewer`.
- Google Identity Services identifies staff; the server-side Firestore
  allowlist and signed session cookie authorize same-origin API access.
- Administrative imports use separate operator ADC, dry-run by default, with
  audit logs and backups. The Vercel runtime identity cannot write.
