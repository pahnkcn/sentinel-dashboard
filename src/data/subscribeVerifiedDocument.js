import { createServerSnapshotGate } from './serverSnapshotGate.js';

function publicError(error, fallbackCode = 'unknown') {
  const candidate = typeof error?.code === 'string' ? error.code : fallbackCode;
  return {
    code: /^[a-z0-9/_-]{1,80}$/i.test(candidate) ? candidate : fallbackCode,
  };
}

export function subscribeVerifiedDocument({
  documentReference,
  decoder,
  observer,
  listen,
}) {
  if (typeof decoder !== 'function') {
    throw new TypeError('verified document subscription requires a decoder');
  }
  if (typeof observer?.next !== 'function' || typeof observer?.error !== 'function') {
    throw new TypeError('verified document subscription requires next and error observers');
  }
  if (typeof listen !== 'function') {
    throw new TypeError('verified document subscription requires a listener');
  }

  let active = true;
  let stopped = false;
  const gate = createServerSnapshotGate({
    onUnverified: error => {
      if (active) observer.error(publicError(error));
    },
  });
  let stopSnapshot = () => {};

  try {
    stopSnapshot = listen(
      documentReference,
      { includeMetadataChanges: true },
      snapshot => {
        if (!active || !gate.accept(snapshot.metadata)) return;

        let decoded;
        try {
          decoded = decoder(snapshot);
        } catch {
          observer.error({ code: 'document-decode-failed' });
          return;
        }

        if (!decoded?.ok) {
          observer.error(publicError(decoded?.error, 'document-decode-failed'));
          return;
        }
        observer.next(decoded.value);
      },
      error => {
        if (!active) return;
        active = false;
        gate.close();
        observer.error(publicError(error));
      },
    );
  } catch (error) {
    active = false;
    gate.close();
    throw error;
  }

  return () => {
    if (stopped) return;
    stopped = true;
    active = false;
    gate.close();
    stopSnapshot();
  };
}
