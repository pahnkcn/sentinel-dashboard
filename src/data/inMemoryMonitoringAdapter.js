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
    emit(stream, payload) {
      for (const observer of observers) observer.next(stream, payload);
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
