import { useSyncExternalStore } from 'react';

import { createHttpMonitoringAdapter } from './httpMonitoringAdapter.js';
import { createMonitoringDataStore } from './monitoringDataStore.js';

const monitoringDataStore = createMonitoringDataStore(
  createHttpMonitoringAdapter(),
);

export function useMonitoringData() {
  return useSyncExternalStore(
    monitoringDataStore.subscribe,
    monitoringDataStore.getSnapshot,
    monitoringDataStore.getSnapshot,
  );
}

export function retryMonitoringData() {
  monitoringDataStore.retry();
}
