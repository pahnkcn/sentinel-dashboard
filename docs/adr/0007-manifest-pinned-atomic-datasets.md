# ADR 0007: Manifest-pinned atomic datasets

- Status: Accepted
- Date: 2026-07-14

## Context

Three independent real-time collection listeners can complete and update at
different times. Publishing each stream directly lets consumers observe a mix
of old and new collection generations. A newest-stream timestamp also cannot
claim that the complete dataset was verified at that instant.

Adding a version field to the original top-level collections is insufficient:
staging a new version with stable document IDs would overwrite the published
documents before the version switch.

## Decision

Use `monitoringManifests/current` as the version-selection Interface. Store
each immutable generation under
`monitoringDatasets/{version}/{students|logs|assessments}/{id}`. Security Rules
permit privileged reads only when the path version equals the current manifest
version and deny legacy, candidate, retired, nested, and unknown paths.

The Firebase Adapter verifies the manifest, opens three bounded listeners for
that version, and passes decoded payloads to a coordinator Module. The
coordinator buffers all streams and invokes the lifecycle store's atomic
replacement Interface only after all three are server-confirmed. Generation
tokens discard late callbacks. An updated payload under a published version is
an invariant violation and fails closed until another manifest transition.

Administrative tooling must stage and validate a new immutable version, then
change the manifest as the final publish operation. It must never mutate a
published version.

## Consequences

- The data Module gains Depth while screens keep a small stable Interface.
- Version isolation gives strong Locality to a complete imported generation.
- One coordinator invariant has Leverage across every analytics consumer.
- The Firebase Adapter remains a replaceable Seam; the in-memory Adapter tests
  lifecycle behavior without Firebase.
- `lastUpdatedAt` represents complete-dataset verification, not the newest
  individual stream.
- Imports require trusted server-side tooling, validation, retention, and a
  single-publisher or precondition protocol outside this browser repository.
