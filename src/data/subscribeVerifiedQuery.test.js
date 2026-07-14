import assert from 'node:assert/strict';
import test from 'node:test';

import { subscribeVerifiedQuery } from './subscribeVerifiedQuery.js';

function validDecoder({ documentId, data }) {
  return { ok: true, value: { id: documentId, value: data.value } };
}

function createSnapshot({ fromCache, hasPendingWrites = false, documents = [] }) {
  return {
    metadata: { fromCache, hasPendingWrites },
    docs: documents.map(({ id, value }) => ({ id, data: () => ({ value }) })),
  };
}

function connectHarness() {
  const nextEvents = [];
  const errors = [];
  let nextSnapshot;
  let failSnapshot;
  let unsubscribeCount = 0;
  let clock = 100;

  const stop = subscribeVerifiedQuery({
    streamName: 'students',
    streamQuery: 'query',
    decoder: validDecoder,
    recordLimit: 1,
    observer: {
      next: (...event) => nextEvents.push(event),
      error: (...event) => errors.push(event),
    },
    listen(query, options, onNext, onError) {
      assert.equal(query, 'query');
      assert.deepEqual(options, { includeMetadataChanges: true });
      nextSnapshot = onNext;
      failSnapshot = onError;
      return () => { unsubscribeCount += 1; };
    },
    clock: () => clock++,
  });

  return {
    stop,
    nextEvents,
    errors,
    emit: snapshot => nextSnapshot(snapshot),
    fail: error => failSnapshot(error),
    unsubscribeCount: () => unsubscribeCount,
  };
}

test('suppresses cache data, accepts server data, and recovers after a cache transition', () => {
  const harness = connectHarness();

  harness.emit(createSnapshot({
    fromCache: true,
    documents: [{ id: 'cached', value: 'stale' }],
  }));
  assert.deepEqual(harness.nextEvents, []);
  assert.deepEqual(harness.errors, []);

  harness.emit(createSnapshot({
    fromCache: false,
    documents: [
      { id: 'verified', value: 'current' },
      { id: 'over-limit', value: 'hidden' },
    ],
  }));
  assert.deepEqual(harness.nextEvents, [[
    'students',
    {
      records: [{ id: 'verified', value: 'current' }],
      issues: [],
      truncated: true,
      receivedAt: 100,
    },
  ]]);

  harness.emit(createSnapshot({ fromCache: true }));
  harness.emit(createSnapshot({ fromCache: true }));
  assert.deepEqual(harness.errors, [[
    'students',
    { code: 'snapshot-from-cache' },
  ]]);

  harness.emit(createSnapshot({ fromCache: false }));
  assert.equal(harness.nextEvents.length, 2);
  assert.equal(harness.nextEvents[1][1].receivedAt, 101);

  harness.emit(createSnapshot({ fromCache: false, hasPendingWrites: true }));
  assert.deepEqual(harness.errors.at(-1), [
    'students',
    { code: 'snapshot-has-pending-writes' },
  ]);
  assert.equal(harness.nextEvents.length, 2);

  harness.emit(createSnapshot({ fromCache: false }));
  assert.equal(harness.nextEvents.length, 3);
  harness.stop();
});

test('unsubscribes once and ignores callbacks after disconnect', () => {
  const harness = connectHarness();

  harness.stop();
  harness.stop();
  harness.emit(createSnapshot({ fromCache: false }));
  harness.fail({ code: 'permission-denied' });

  assert.equal(harness.unsubscribeCount(), 1);
  assert.deepEqual(harness.nextEvents, []);
  assert.deepEqual(harness.errors, []);
});

test('sanitizes terminal listener errors and stops future events', () => {
  const harness = connectHarness();

  harness.fail({ code: 'permission-denied', message: 'sensitive detail' });
  harness.emit(createSnapshot({ fromCache: false }));

  assert.deepEqual(harness.errors, [[
    'students',
    { code: 'permission-denied' },
  ]]);
  assert.doesNotMatch(JSON.stringify(harness.errors), /sensitive detail/);
  assert.deepEqual(harness.nextEvents, []);
  harness.stop();
  assert.equal(harness.unsubscribeCount(), 1);
});
