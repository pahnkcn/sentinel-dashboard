import { decodeSnapshot } from './decodeSnapshot.js';
import { createServerSnapshotGate } from './serverSnapshotGate.js';

export function subscribeVerifiedQuery({
  streamName,
  streamQuery,
  decoder,
  recordLimit,
  observer,
  listen,
  clock = Date.now,
}) {
  let active = true;
  let stopped = false;
  const gate = createServerSnapshotGate({
    onUnverified: error => {
      if (active) observer.error(streamName, error);
    },
  });
  let stopSnapshot = () => {};

  try {
    stopSnapshot = listen(
      streamQuery,
      { includeMetadataChanges: true },
      snapshot => {
        if (!active || !gate.accept(snapshot.metadata)) return;
        const truncated = snapshot.docs.length > recordLimit;
        const decoded = decodeSnapshot(
          { docs: snapshot.docs.slice(0, recordLimit) },
          decoder,
        );
        observer.next(streamName, {
          ...decoded,
          truncated,
          receivedAt: clock(),
        });
      },
      error => {
        if (!active) return;
        active = false;
        gate.close();
        observer.error(streamName, { code: error?.code || 'unknown' });
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
