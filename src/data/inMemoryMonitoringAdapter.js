import {
  MONITORING_DATA_CLASSIFICATION,
  MONITORING_SCHEMA_VERSION,
} from './datasetManifest.js';

export function createInMemoryMonitoringAdapter() {
  const observers = new Set();
  let disconnectCount = 0;

  return {
    connect(observer) {
      observers.add(observer);
      let connected = true;
      return () => {
        if (!connected) return;
        connected = false;
        observers.delete(observer);
        disconnectCount += 1;
      };
    },
    beginDataset(version) {
      for (const observer of observers) observer.beginDataset(version);
    },
    replaceDataset(streams, { version = 'test-v1', verifiedAt = Date.now() } = {}) {
      for (const observer of observers) {
        observer.replaceDataset({
          version,
          schemaVersion: MONITORING_SCHEMA_VERSION,
          dataClassification: MONITORING_DATA_CLASSIFICATION,
          publishedAt: '2026-01-01T00:00:00.000Z',
          streams,
          verifiedAt,
        });
      }
    },
    publishDataset(streams, options = {}) {
      const version = options.version ?? 'test-v1';
      for (const observer of observers) {
        observer.beginDataset(version);
        observer.replaceDataset({
          version,
          schemaVersion: MONITORING_SCHEMA_VERSION,
          dataClassification: MONITORING_DATA_CLASSIFICATION,
          publishedAt: options.publishedAt ?? '2026-01-01T00:00:00.000Z',
          streams,
          verifiedAt: options.verifiedAt ?? Date.now(),
        });
      }
    },
    verify(stream) {
      for (const observer of observers) observer.verified(stream);
    },
    fail(stream, error) {
      for (const observer of observers) observer.error(stream, error);
    },
    get connectionCount() {
      return observers.size;
    },
    get disconnectCount() {
      return disconnectCount;
    },
  };
}
