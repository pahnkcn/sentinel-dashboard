import assert from 'node:assert/strict';
import test from 'node:test';

import { createVersionedDatasetCoordinator } from './versionedDatasetCoordinator.js';

function createHarness() {
  const begins = [];
  const datasets = [];
  const verified = [];
  const errors = [];
  const coordinator = createVersionedDatasetCoordinator({
    streams: ['students', 'logs', 'assessments'],
    onBegin: version => begins.push(version),
    onDataset: dataset => datasets.push(dataset),
    onVerified: stream => verified.push(stream),
    onError: (stream, error) => errors.push([stream, error]),
    clock: () => 42,
  });
  return { coordinator, begins, datasets, verified, errors };
}

test('buffers every stream and publishes one atomic version', () => {
  const harness = createHarness();
  const token = harness.coordinator.begin('release-1');

  harness.coordinator.accept(token, 'logs', { records: [{ id: 'l1' }], receivedAt: 10 });
  harness.coordinator.accept(token, 'students', { records: [{ id: 's1' }], receivedAt: 20 });
  assert.deepEqual(harness.datasets, []);

  harness.coordinator.accept(token, 'assessments', {
    records: [{ id: 'a1' }],
    issues: [],
    receivedAt: 30,
  });

  assert.deepEqual(harness.begins, ['release-1']);
  assert.equal(harness.datasets.length, 1);
  assert.equal(harness.datasets[0].version, 'release-1');
  assert.equal(harness.datasets[0].verifiedAt, 42);
  assert.deepEqual(harness.datasets[0].streams.logs.records, [{ id: 'l1' }]);
  assert.equal('receivedAt' in harness.datasets[0].streams.logs, false);
});

test('allows identical verification events but rejects same-version mutation', () => {
  const harness = createHarness();
  const token = harness.coordinator.begin('release-1');
  for (const stream of ['students', 'logs', 'assessments']) {
    harness.coordinator.accept(token, stream, { records: [{ id: stream }] });
  }

  assert.equal(harness.coordinator.accept(token, 'logs', {
    records: [{ id: 'logs' }],
    receivedAt: 999,
  }), true);
  assert.equal(harness.datasets.length, 1);

  assert.equal(harness.coordinator.accept(token, 'logs', {
    records: [{ id: 'changed' }],
  }), false);
  assert.deepEqual(harness.errors.at(-1), [
    'logs',
    { code: 'published-dataset-mutated' },
  ]);
  assert.equal(harness.coordinator.accept(token, 'students', {
    records: [{ id: 'students' }],
  }), false);
});

test('ignores stale listener generations after a manifest transition', () => {
  const harness = createHarness();
  const staleToken = harness.coordinator.begin('release-1');
  const currentToken = harness.coordinator.begin('release-2');

  assert.equal(harness.coordinator.accept(staleToken, 'students', { records: [] }), false);
  assert.equal(harness.coordinator.fail(staleToken, 'logs', { code: 'late-error' }), false);

  for (const stream of ['students', 'logs', 'assessments']) {
    harness.coordinator.accept(currentToken, stream, { records: [] });
  }
  assert.equal(harness.datasets.length, 1);
  assert.equal(harness.datasets[0].version, 'release-2');
  assert.deepEqual(harness.errors, []);
});

test('invalidates a buffered stream failure until that stream re-verifies', () => {
  const harness = createHarness();
  const token = harness.coordinator.begin('release-1');

  harness.coordinator.accept(token, 'students', { records: [] });
  harness.coordinator.fail(token, 'students', { code: 'snapshot-from-cache' });
  harness.coordinator.accept(token, 'logs', { records: [] });
  harness.coordinator.accept(token, 'assessments', { records: [] });
  assert.deepEqual(harness.datasets, []);
  assert.deepEqual(harness.errors, [['students', { code: 'snapshot-from-cache' }]]);

  harness.coordinator.accept(token, 'students', { records: [] });
  assert.equal(harness.datasets.length, 1);
  assert.equal(harness.verified.filter(stream => stream === 'students').length, 2);
});

test('validates versions and callbacks', () => {
  const harness = createHarness();
  assert.throws(() => harness.coordinator.begin('../unsafe'), /safe identifier/);
  assert.throws(
    () => createVersionedDatasetCoordinator({ streams: [] }),
    /requires named streams/,
  );
});
