import assert from 'node:assert/strict';
import test from 'node:test';

import { createInMemoryMonitoringAdapter } from './inMemoryMonitoringAdapter.js';
import { createMonitoringDataStore } from './monitoringDataStore.js';

function connectStore() {
  const adapter = createInMemoryMonitoringAdapter();
  const store = createMonitoringDataStore(adapter);
  let notifications = 0;
  const unsubscribe = store.subscribe(() => { notifications += 1; });
  return { adapter, store, unsubscribe, notifications: () => notifications };
}

test('becomes ready after all streams arrive in any order', () => {
  const { adapter, store, unsubscribe } = connectStore();

  assert.equal(adapter.connectionCount, 1);
  assert.equal(store.getSnapshot().status, 'connecting');

  adapter.emit('logs', { records: [{ id: 'log' }], issues: [], receivedAt: 20 });
  adapter.emit('assessments', { records: [{ id: 'assessment' }], issues: [], receivedAt: 10 });
  assert.equal(store.getSnapshot().status, 'connecting');

  adapter.emit('students', { records: [{ id: 'student' }], issues: [], receivedAt: 30 });

  const snapshot = store.getSnapshot();
  assert.equal(snapshot.status, 'ready');
  assert.deepEqual(snapshot.students, [{ id: 'student' }]);
  assert.equal(snapshot.lastUpdatedAt, 30);
  unsubscribe();
});

test('marks invalid or truncated data as degraded', () => {
  const { adapter, store, unsubscribe } = connectStore();

  adapter.emit('students', {
    records: [],
    issues: [{ documentId: 'bad', issues: [] }],
    receivedAt: 1,
  });
  adapter.emit('logs', { records: [], issues: [], truncated: true, receivedAt: 1 });
  adapter.emit('assessments', { records: [], issues: [], receivedAt: 1 });

  const snapshot = store.getSnapshot();
  assert.equal(snapshot.status, 'degraded');
  assert.equal(snapshot.issueCount, 1);
  assert.deepEqual(snapshot.truncatedStreams, ['logs']);
  unsubscribe();
});

test('fails closed on a stream error and recovers on the next snapshot', () => {
  const { adapter, store, unsubscribe } = connectStore();
  for (const stream of ['students', 'logs', 'assessments']) {
    adapter.emit(stream, { records: [], issues: [], receivedAt: 1 });
  }

  adapter.fail('logs', { code: 'permission-denied', message: 'sensitive detail' });

  let snapshot = store.getSnapshot();
  assert.equal(snapshot.status, 'error');
  assert.equal(snapshot.errors.logs.code, 'permission-denied');
  assert.doesNotMatch(JSON.stringify(snapshot.errors), /sensitive detail/);

  adapter.emit('logs', { records: [], issues: [], receivedAt: 2 });
  snapshot = store.getSnapshot();
  assert.equal(snapshot.status, 'ready');
  assert.equal(snapshot.errors.logs, null);
  unsubscribe();
});

test('disconnects once and clears sensitive records after the last subscriber leaves', () => {
  const { adapter, store, unsubscribe } = connectStore();
  adapter.emit('students', { records: [{ id: 'sensitive' }], issues: [], receivedAt: 1 });

  unsubscribe();
  unsubscribe();

  assert.equal(adapter.disconnectCount, 1);
  assert.equal(adapter.connectionCount, 0);
  assert.deepEqual(store.getSnapshot().students, []);
  assert.equal(store.getSnapshot().status, 'idle');
});

test('shares one adapter connection across subscribers', () => {
  const adapter = createInMemoryMonitoringAdapter();
  const store = createMonitoringDataStore(adapter);
  const first = store.subscribe(() => {});
  const second = store.subscribe(() => {});

  assert.equal(adapter.connectionCount, 1);
  first();
  assert.equal(adapter.connectionCount, 1);
  second();
  assert.equal(adapter.connectionCount, 0);
  assert.equal(adapter.disconnectCount, 1);
});

test('reconnects without leaking records after a StrictMode-style remount', () => {
  const adapter = createInMemoryMonitoringAdapter();
  const store = createMonitoringDataStore(adapter);
  const firstUnmount = store.subscribe(() => {});
  adapter.emit('students', { records: [{ id: 'sensitive' }], issues: [], receivedAt: 1 });

  firstUnmount();
  const secondUnmount = store.subscribe(() => {});

  assert.equal(adapter.connectionCount, 1);
  assert.equal(adapter.disconnectCount, 1);
  assert.equal(store.getSnapshot().status, 'connecting');
  assert.deepEqual(store.getSnapshot().students, []);

  secondUnmount();
  assert.equal(adapter.disconnectCount, 2);
});

test('turns adapter startup failures into a public error state', () => {
  const store = createMonitoringDataStore({
    connect() {
      throw new Error('private connection details');
    },
  });
  const unsubscribe = store.subscribe(() => {});

  const snapshot = store.getSnapshot();
  assert.equal(snapshot.status, 'error');
  assert.doesNotMatch(JSON.stringify(snapshot), /private connection details/);
  unsubscribe();
});
