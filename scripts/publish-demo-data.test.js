import assert from 'node:assert/strict';
import test from 'node:test';

import { generateSyntheticDataset } from './demo-data.mjs';
import {
  assertDatasetVersion,
  publishDemoDataset,
} from './publish-demo-data.mjs';

function tinyDataset() {
  return generateSyntheticDataset({
    studentCount: 1,
    endDate: '2026-06-30',
    seed: 'publisher-test',
  });
}

function successfulResponse() {
  return {
    ok: true,
    status: 200,
    async json() { return {}; },
    async text() { return ''; },
  };
}

test('publisher validates explicit safe synthetic versions', () => {
  assert.equal(assertDatasetVersion('demo-release-2026-07-28'), 'demo-release-2026-07-28');
  assert.throws(() => assertDatasetVersion('release-real'), /must start with demo-/);
  assert.throws(() => assertDatasetVersion('demo-bad/version'), /safe characters/);
});

test('dry-run validates and summarizes without credentials or network writes', async () => {
  let credentialCalls = 0;
  let requestCalls = 0;
  const summary = await publishDemoDataset({
    dataset: tinyDataset(),
    projectId: 'sentinel-demo-project',
    version: 'demo-dry-run',
    getAccessToken: async () => {
      credentialCalls += 1;
      return 'token';
    },
    request: async () => {
      requestCalls += 1;
      return successfulResponse();
    },
  });

  assert.equal(summary.mode, 'dry-run');
  assert.ok(summary.recordCount > 0);
  assert.equal(credentialCalls, 0);
  assert.equal(requestCalls, 0);
});

test('commit writes immutable records before switching the current manifest', async () => {
  const bodies = [];
  let credentialCalls = 0;
  const summary = await publishDemoDataset({
    dataset: tinyDataset(),
    projectId: 'sentinel-demo-project',
    version: 'demo-commit-order',
    commit: true,
    getAccessToken: async () => {
      credentialCalls += 1;
      return 'operator-token';
    },
    request: async (_url, options) => {
      bodies.push(JSON.parse(options.body));
      assert.equal(options.headers.Authorization, 'Bearer operator-token');
      return successfulResponse();
    },
    clock: () => new Date('2026-07-28T00:00:00.000Z'),
  });

  assert.equal(summary.mode, 'commit');
  assert.equal(credentialCalls, 1);
  assert.ok(bodies.length >= 2);
  const recordWrites = bodies.slice(0, -1).flatMap(body => body.writes);
  assert.ok(recordWrites.every(write => write.currentDocument?.exists === false));
  assert.ok(recordWrites.every(write => write.update.name.includes('/monitoringDatasets/')));
  const finalWrites = bodies.at(-1).writes;
  assert.equal(finalWrites.length, 1);
  assert.match(finalWrites[0].update.name, /\/monitoringManifests\/current$/);
  assert.equal(
    finalWrites[0].update.fields.dataClassification.stringValue,
    'synthetic',
  );
});

test('publisher rejects a dataset containing a source-like identity before any write', async () => {
  const dataset = tinyDataset();
  dataset.streams.students[0].id = 'student-001';
  let requestCalls = 0;

  await assert.rejects(
    () => publishDemoDataset({
      dataset,
      projectId: 'sentinel-demo-project',
      version: 'demo-rejected',
      commit: true,
      getAccessToken: async () => 'token',
      request: async () => {
        requestCalls += 1;
        return successfulResponse();
      },
    }),
    /student ID must be demo-/,
  );
  assert.equal(requestCalls, 0);
});
