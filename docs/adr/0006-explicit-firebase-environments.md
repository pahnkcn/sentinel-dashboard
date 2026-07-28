# ADR 0006: Explicit Firebase environments

- Status: Accepted
- Date: 2026-07-14

## Context

A bundled production fallback allowed a missing local environment file to
connect the browser to a real Firebase project. Partial variables could also
create an incoherent mixed-project configuration. Once App Check enforcement
is active, remote clients without a token fail unpredictably.

## Decision

Remove every Firebase fallback. Validate all required values both while Vite
loads configuration and again in the browser. Reject missing placeholders,
malformed host/project identifiers, and mismatched app/sender IDs.

Classify an actual Vite development server from the ConfigEnv values
`command === "serve"` and `isPreview !== true`; do not trust the freely
selectable mode name. Force every such server to fixed localhost Auth and
Firestore emulators using a tracked demo project. Forbid emulators in
production. Require a reCAPTCHA Enterprise App Check site key for every remote
mode. Keep the tracked Firebase CLI default pointed at the demo project and
require an explicit `--project` for deployment.

## Consequences

- A missing environment stops the build instead of risking live access.
- Local development requires the emulators to be running.
- `vite --mode production` cannot turn a development server into a live-data
  client; it fails before serving.
- Remote staging and production require App Check registration.
- Environment setup is more explicit, but failures occur before any sensitive
  request and name only the invalid setting, not its value.
