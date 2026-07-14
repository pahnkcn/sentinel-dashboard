import { isSafeDatasetVersion } from './datasetManifest.js';

function semanticPayload(payload) {
  return {
    records: Array.isArray(payload?.records) ? payload.records : [],
    issues: Array.isArray(payload?.issues) ? payload.issues : [],
    truncated: payload?.truncated === true,
  };
}

function fingerprint(payload) {
  return JSON.stringify(semanticPayload(payload));
}

export function createVersionedDatasetCoordinator({
  streams,
  onBegin,
  onDataset,
  onVerified,
  onError,
  clock = Date.now,
}) {
  if (!Array.isArray(streams)) {
    throw new TypeError('dataset coordinator requires named streams');
  }
  const expectedStreams = [...new Set(streams)];
  if (expectedStreams.length === 0 || expectedStreams.some(stream => typeof stream !== 'string')) {
    throw new TypeError('dataset coordinator requires named streams');
  }
  for (const callback of [onBegin, onDataset, onVerified, onError]) {
    if (typeof callback !== 'function') {
      throw new TypeError('dataset coordinator requires lifecycle callbacks');
    }
  }

  const knownStreams = new Set(expectedStreams);
  let tokenSequence = 0;
  let activeToken = null;
  let version = null;
  let payloads = new Map();
  let publishedFingerprints = null;
  let blocked = false;

  const isCurrent = token => token === activeToken;

  return {
    begin(nextVersion) {
      if (!isSafeDatasetVersion(nextVersion)) {
        throw new TypeError('dataset version must be a safe identifier');
      }

      activeToken = ++tokenSequence;
      version = nextVersion;
      payloads = new Map();
      publishedFingerprints = null;
      blocked = false;
      onBegin(version);
      return activeToken;
    },
    accept(token, stream, payload) {
      if (!isCurrent(token) || !knownStreams.has(stream) || blocked) return false;

      let nextFingerprint;
      try {
        nextFingerprint = fingerprint(payload);
      } catch {
        blocked = true;
        onError(stream, { code: 'invalid-dataset-payload' });
        return false;
      }

      if (publishedFingerprints !== null) {
        if (publishedFingerprints.get(stream) !== nextFingerprint) {
          blocked = true;
          onError(stream, { code: 'published-dataset-mutated' });
          return false;
        }
        onVerified(stream);
        return true;
      }

      payloads.set(stream, semanticPayload(payload));
      onVerified(stream);
      if (payloads.size !== expectedStreams.length) return true;

      publishedFingerprints = new Map(
        expectedStreams.map(name => [name, fingerprint(payloads.get(name))]),
      );
      onDataset({
        version,
        streams: Object.fromEntries(
          expectedStreams.map(name => [name, payloads.get(name)]),
        ),
        verifiedAt: clock(),
      });
      return true;
    },
    fail(token, stream, error) {
      if (!isCurrent(token) || !knownStreams.has(stream) || blocked) return false;
      if (publishedFingerprints === null) payloads.delete(stream);
      onError(stream, error);
      return true;
    },
  };
}
