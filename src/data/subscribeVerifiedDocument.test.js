import assert from 'node:assert/strict';
import test from 'node:test';

import { subscribeVerifiedDocument } from './subscribeVerifiedDocument.js';

function connectHarness(decoder = snapshot => ({ ok: true, value: snapshot.value })) {
  const nextEvents = [];
  const errors = [];
  let nextSnapshot;
  let failSnapshot;
  let unsubscribeCount = 0;

  const stop = subscribeVerifiedDocument({
    documentReference: 'manifest-reference',
    decoder,
    observer: {
      next: value => nextEvents.push(value),
      error: error => errors.push(error),
    },
    listen(reference, options, onNext, onError) {
      assert.equal(reference, 'manifest-reference');
      assert.deepEqual(options, { includeMetadataChanges: true });
      nextSnapshot = onNext;
      failSnapshot = onError;
      return () => { unsubscribeCount += 1; };
    },
  });

  return {
    stop,
    nextEvents,
    errors,
    emit: value => nextSnapshot(value),
    fail: error => failSnapshot(error),
    unsubscribeCount: () => unsubscribeCount,
  };
}

test('passes only committed server documents through the decoder', () => {
  const harness = connectHarness();

  harness.emit({ metadata: { fromCache: true, hasPendingWrites: false }, value: 'cached' });
  harness.emit({ metadata: { fromCache: false, hasPendingWrites: true }, value: 'pending' });
  assert.deepEqual(harness.nextEvents, []);

  harness.emit({ metadata: { fromCache: false, hasPendingWrites: false }, value: 'verified' });
  assert.deepEqual(harness.nextEvents, ['verified']);

  harness.emit({ metadata: { fromCache: true, hasPendingWrites: false }, value: 'stale' });
  assert.deepEqual(harness.errors, [{ code: 'snapshot-from-cache' }]);
  harness.stop();
});

test('reports bounded decoder and listener errors', () => {
  const rejected = connectHarness(() => ({
    ok: false,
    error: { code: 'dataset-manifest-invalid', detail: 'sensitive' },
  }));
  rejected.emit({ metadata: { fromCache: false, hasPendingWrites: false } });
  assert.deepEqual(rejected.errors, [{ code: 'dataset-manifest-invalid' }]);
  assert.doesNotMatch(JSON.stringify(rejected.errors), /sensitive/);
  rejected.stop();

  const terminal = connectHarness();
  terminal.fail({ code: 'permission-denied', message: 'private detail' });
  terminal.emit({ metadata: { fromCache: false, hasPendingWrites: false }, value: 'late' });
  assert.deepEqual(terminal.errors, [{ code: 'permission-denied' }]);
  assert.deepEqual(terminal.nextEvents, []);
  terminal.stop();
  terminal.stop();
  assert.equal(terminal.unsubscribeCount(), 1);
});

test('validates the subscription Interface', () => {
  assert.throws(() => subscribeVerifiedDocument({}), /requires a decoder/);
  assert.throws(
    () => subscribeVerifiedDocument({ decoder() {} }),
    /requires next and error observers/,
  );
});
