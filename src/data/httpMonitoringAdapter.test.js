import assert from 'node:assert/strict';
import test from 'node:test';

import { createHttpMonitoringAdapter } from './httpMonitoringAdapter.js';

function response(status, body) {
  return {
    status,
    ok: status >= 200 && status < 300,
    json: async () => body,
  };
}

function manifest(version) {
  return {
    version,
    schemaVersion: 2,
    dataClassification: 'synthetic',
    publishedAt: `2026-07-${version === 'v1' ? '01' : '02'}T00:00:00.000Z`,
  };
}

const RECORDS = Object.freeze({
  students: [{ id: 'demo-001', name: 'Demo One', room: 'A-01' }],
  logs: [{
    id: 'demo-log-001',
    studentId: 'demo-001',
    date: '2026-07-01',
    week: 1,
    self: 2,
    buddy: null,
    command: null,
    physicalInjury: null,
    selfObservedAt: '2026-07-01T08:00:00.000Z',
  }],
  assessments: [{
    id: 'demo-assessment-001',
    studentId: 'demo-001',
    week: 0,
    dass_d: 0,
    dass_a: 7,
    dass_s: 21,
    cd_risc: 30,
    grit: 24,
    drawing_note: '',
  }],
});

function observe(adapter) {
  return new Promise((resolve, reject) => {
    const errors = [];
    adapter.connect({
      beginDataset() {},
      replaceDataset: resolve,
      verified() {},
      error(stream, error) {
        errors.push([stream, error]);
        if (errors.length === 3) reject(Object.assign(error, { errors }));
      },
    });
  });
}

test('loads every paginated stream and publishes only after manifest re-verification', async () => {
  const calls = [];
  let studentPage = 0;
  const fetchImplementation = async url => {
    calls.push(url);
    if (url === '/api/manifest') return response(200, manifest('v1'));
    const parsed = new URL(url, 'https://sentinel.example');
    const stream = parsed.searchParams.get('stream');
    if (stream === 'students' && studentPage++ === 0) {
      return response(200, { records: [], nextPageToken: 'page-2' });
    }
    return response(200, { records: RECORDS[stream], nextPageToken: null });
  };

  const dataset = await observe(createHttpMonitoringAdapter({
    fetchImplementation,
    clock: () => 42,
  }));

  assert.equal(dataset.version, 'v1');
  assert.equal(dataset.schemaVersion, 2);
  assert.equal(dataset.dataClassification, 'synthetic');
  assert.equal(dataset.verifiedAt, 42);
  assert.equal(dataset.streams.students.records[0].id, 'demo-001');
  assert.equal(dataset.streams.students.records[0].name, 'Demo One');
  assert.equal(dataset.streams.logs.records[0].selfObservedAt, '2026-07-01T08:00:00.000Z');
  assert.equal(dataset.streams.assessments.records[0].dass_s, 21);
  assert.equal(calls.filter(url => url === '/api/manifest').length, 2);
  assert.ok(calls.some(url => url.includes('pageToken=page-2')));
});

test('restarts atomically when the manifest changes during a load', async () => {
  let manifestCall = 0;
  const fetchImplementation = async url => {
    if (url === '/api/manifest') {
      manifestCall += 1;
      return response(200, manifest(manifestCall === 1 ? 'v1' : 'v2'));
    }
    const stream = new URL(url, 'https://sentinel.example').searchParams.get('stream');
    return response(200, { records: RECORDS[stream], nextPageToken: null });
  };

  const dataset = await observe(createHttpMonitoringAdapter({ fetchImplementation }));
  assert.equal(dataset.version, 'v2');
  assert.equal(manifestCall, 4);
});

test('fails closed on unsupported manifests without reflecting server details', async () => {
  const adapter = createHttpMonitoringAdapter({
    fetchImplementation: async () => response(200, {
      ...manifest('v1'),
      schemaVersion: 1,
      secret: 'private@example.test',
    }),
  });

  await assert.rejects(
    observe(adapter),
    error => (
      error.code === 'dataset-manifest-invalid'
      && error.errors.length === 3
      && !error.message.includes('private@example.test')
    ),
  );
});
