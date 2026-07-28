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

function payload(records = [], overrides = {}) {
  return { records, issues: [], truncated: false, ...overrides };
}

function dataset(overrides = {}) {
  return {
    students: payload(),
    logs: payload(),
    assessments: payload(),
    ...overrides,
  };
}

test('publishes all streams as one verified dataset', () => {
  const { adapter, store, unsubscribe } = connectStore();

  assert.equal(adapter.connectionCount, 1);
  assert.equal(store.getSnapshot().status, 'connecting');

  adapter.publishDataset(dataset({
    students: payload([{ id: 'student' }]),
    logs: payload([{ id: 'log', studentId: 'student' }]),
    assessments: payload([{ id: 'assessment', studentId: 'student' }]),
  }), { version: 'release-1', verifiedAt: 30 });

  const snapshot = store.getSnapshot();
  assert.equal(snapshot.status, 'ready');
  assert.equal(snapshot.datasetVersion, 'release-1');
  assert.deepEqual(snapshot.students, [{ id: 'student' }]);
  assert.equal(snapshot.lastUpdatedAt, 30);
  unsubscribe();
});

test('marks invalid or truncated data as degraded', () => {
  const { adapter, store, unsubscribe } = connectStore();

  adapter.publishDataset(dataset({
    students: payload([], { issues: [{ documentId: 'bad', issues: [] }] }),
    logs: payload([], { truncated: true }),
  }), { verifiedAt: 1 });

  const snapshot = store.getSnapshot();
  assert.equal(snapshot.status, 'degraded');
  assert.equal(snapshot.issueCount, 1);
  assert.deepEqual(snapshot.truncatedStreams, ['logs']);
  unsubscribe();
});

test('degrades orphan records and recovers when their student arrives', () => {
  const { adapter, store, unsubscribe } = connectStore();

  adapter.publishDataset(dataset({
    logs: payload([{ id: 'orphan-log', studentId: 'missing' }]),
    assessments: payload([{ id: 'orphan-assessment', studentId: 'missing' }]),
  }), { version: 'release-1', verifiedAt: 1 });

  let snapshot = store.getSnapshot();
  assert.equal(snapshot.status, 'degraded');
  assert.equal(snapshot.issueCount, 2);
  assert.equal(snapshot.integrityIssues.logs[0].documentId, 'orphan-log');
  assert.equal(
    snapshot.integrityIssues.assessments[0].issues[0].field,
    'studentId',
  );

  adapter.publishDataset(dataset({
    students: payload([{ id: 'missing' }]),
    logs: payload([{ id: 'orphan-log', studentId: 'missing' }]),
    assessments: payload([{ id: 'orphan-assessment', studentId: 'missing' }]),
  }), { version: 'release-2', verifiedAt: 2 });
  snapshot = store.getSnapshot();
  assert.equal(snapshot.status, 'ready');
  assert.equal(snapshot.datasetVersion, 'release-2');
  assert.equal(snapshot.issueCount, 0);
  assert.deepEqual(snapshot.integrityIssues.logs, []);
  assert.deepEqual(snapshot.integrityIssues.assessments, []);
  unsubscribe();
});

test('fails closed on a stream error and recovers on the next snapshot', () => {
  const { adapter, store, unsubscribe } = connectStore();
  adapter.publishDataset(dataset(), { verifiedAt: 1 });

  adapter.fail('logs', { code: 'permission-denied', message: 'sensitive detail' });

  let snapshot = store.getSnapshot();
  assert.equal(snapshot.status, 'error');
  assert.equal(snapshot.errors.logs.code, 'permission-denied');
  assert.doesNotMatch(JSON.stringify(snapshot.errors), /sensitive detail/);

  adapter.verify('logs');
  snapshot = store.getSnapshot();
  assert.equal(snapshot.status, 'ready');
  assert.equal(snapshot.errors.logs, null);
  unsubscribe();
});

test('disconnects once and clears sensitive records after the last subscriber leaves', () => {
  const { adapter, store, unsubscribe } = connectStore();
  adapter.publishDataset(dataset({
    students: payload([{ id: 'sensitive' }]),
  }), { verifiedAt: 1 });

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
  adapter.publishDataset(dataset({
    students: payload([{ id: 'sensitive' }]),
  }), { verifiedAt: 1 });

  firstUnmount();
  const secondUnmount = store.subscribe(() => {});

  assert.equal(adapter.connectionCount, 1);
  assert.equal(adapter.disconnectCount, 1);
  assert.equal(store.getSnapshot().status, 'connecting');
  assert.deepEqual(store.getSnapshot().students, []);

  secondUnmount();
  assert.equal(adapter.disconnectCount, 2);
});

test('retries a failed connection and clears previously verified records', () => {
  const { adapter, store, unsubscribe } = connectStore();
  adapter.publishDataset(dataset({
    students: payload([{ id: 'sensitive' }]),
  }), { verifiedAt: 1 });
  adapter.fail('logs', { code: 'permission-denied' });

  store.retry();

  assert.equal(adapter.connectionCount, 1);
  assert.equal(adapter.disconnectCount, 1);
  assert.equal(store.getSnapshot().status, 'connecting');
  assert.deepEqual(store.getSnapshot().students, []);
  assert.equal(store.getSnapshot().lastUpdatedAt, null);
  unsubscribe();
});

test('clears the old version while the next complete dataset is pending', () => {
  const { adapter, store, unsubscribe, notifications } = connectStore();
  adapter.publishDataset(dataset({
    students: payload([{ id: 'old-sensitive' }]),
  }), { version: 'release-1', verifiedAt: 1 });

  const beforeTransition = notifications();
  adapter.beginDataset('release-2');

  let snapshot = store.getSnapshot();
  assert.equal(snapshot.status, 'connecting');
  assert.equal(snapshot.datasetVersion, 'release-2');
  assert.deepEqual(snapshot.students, []);
  assert.equal(snapshot.lastUpdatedAt, null);
  assert.equal(notifications(), beforeTransition + 1);

  adapter.replaceDataset(dataset({
    students: payload([{ id: 'new-sensitive' }]),
  }), { version: 'release-2', verifiedAt: 2 });
  snapshot = store.getSnapshot();
  assert.equal(snapshot.status, 'ready');
  assert.deepEqual(snapshot.students, [{ id: 'new-sensitive' }]);
  assert.equal(snapshot.lastUpdatedAt, 2);
  unsubscribe();
});

test('ignores an atomic replacement from a stale dataset version', () => {
  const { adapter, store, unsubscribe } = connectStore();
  adapter.beginDataset('release-2');
  adapter.replaceDataset(dataset({
    students: payload([{ id: 'stale-sensitive' }]),
  }), { version: 'release-1', verifiedAt: 1 });

  const snapshot = store.getSnapshot();
  assert.equal(snapshot.status, 'connecting');
  assert.equal(snapshot.datasetVersion, 'release-2');
  assert.deepEqual(snapshot.students, []);
  unsubscribe();
});

test('fails closed when an atomic replacement omits a stream', () => {
  const { adapter, store, unsubscribe } = connectStore();
  adapter.beginDataset('release-1');
  adapter.replaceDataset({
    students: payload([{ id: 'must-not-publish' }]),
    logs: payload(),
  }, { version: 'release-1', verifiedAt: 1 });

  const snapshot = store.getSnapshot();
  assert.equal(snapshot.status, 'error');
  assert.equal(snapshot.errors.students.code, 'atomic-dataset-invalid');
  assert.deepEqual(snapshot.students, []);
  assert.equal(snapshot.lastUpdatedAt, null);
  unsubscribe();
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
