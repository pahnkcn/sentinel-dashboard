import { useSyncExternalStore } from 'react';

import { createFirebaseMonitoringAdapter } from './firebaseMonitoringAdapter.js';
import { createMonitoringDataStore } from './monitoringDataStore.js';

const monitoringDataStore = createMonitoringDataStore(
  createFirebaseMonitoringAdapter(),
);

export function useMonitoringData() {
  return useSyncExternalStore(
    monitoringDataStore.subscribe,
    monitoringDataStore.getSnapshot,
    monitoringDataStore.getSnapshot,
  );
}
