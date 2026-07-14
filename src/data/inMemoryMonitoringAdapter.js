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
        observer.replaceDataset({ version, streams, verifiedAt });
      }
    },
    publishDataset(streams, options = {}) {
      const version = options.version ?? 'test-v1';
      for (const observer of observers) {
        observer.beginDataset(version);
        observer.replaceDataset({
          version,
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
