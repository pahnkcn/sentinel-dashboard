# Sentinel Domain Context

## Scope

Sentinel is a read-only staff dashboard for monitoring mental-health and
physical-wellbeing observations during a 16-week training period. It is not a
data-entry or fixture-generation tool.

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

## Record invariants

- Record IDs and student IDs are non-empty strings and must agree with their
  Firestore document IDs when both are present.
- Daily-observation dates use strict `YYYY-MM-DD` calendar dates.
- Training weeks are integers from `0` through `16`; daily observations use
  weeks `1` through `16`.
- Self, Buddy, and Command values are integers from `1` through `4`; Buddy and
  Command may be null before LOCF is applied.
- Physical-injury and mental-severity values are integers from `1` through `3`.
- DASS-21 dimension values are numbers from `1` through `5`.
- CD-RISC values are numbers from `0` through `40`.
- GRIT values are numbers from `0` through `32`.
- DASS-21 is scheduled for weeks `0`, `4`, `8`, and `16`; CD-RISC and GRIT are
  scheduled for weeks `0`, `8`, and `16`.

## Security and trust

- Names, IDs, rooms, demographics, health details, scores, and drawing notes
  are sensitive data.
- Browser data is untrusted even after Firestore Security Rules authorize a
  read. Records must be decoded before they reach analytics or presentation.
- The dashboard never grants client-side writes. Administrative imports belong
  in separately authorized server-side tooling with audit logs and backups.
- Authentication identifies a staff member; Firestore rules remain the
  authorization source of truth.
