import assert from 'node:assert/strict';
import test from 'node:test';

import { createServerSnapshotGate } from './serverSnapshotGate.js';

function createHarness() {
  const errors = [];
  let timeoutCallback = null;
  let cancelled = false;
  const gate = createServerSnapshotGate({
    onUnverified: error => errors.push(error),
    timeoutMs: 100,
    scheduleTimeout(callback) {
      timeoutCallback = callback;
      return 1;
    },
    cancelTimeout(id) {
      assert.equal(id, 1);
      cancelled = true;
    },
  });

  return {
    gate,
    errors,
    runTimeout: () => timeoutCallback(),
    wasCancelled: () => cancelled,
  };
}

test('rejects initial cache data and fails closed when server verification times out', () => {
  const { gate, errors, runTimeout } = createHarness();

  assert.equal(gate.accept(true), false);
  assert.deepEqual(errors, []);

  runTimeout();
  assert.deepEqual(errors, [{ code: 'server-verification-timeout' }]);

  assert.equal(gate.accept(true), false);
  assert.equal(errors.length, 1);
  assert.equal(gate.accept(false), true);
  gate.close();
});

test('accepts server data and reports each later cache-only transition once', () => {
  const { gate, errors, wasCancelled } = createHarness();

  assert.equal(gate.accept(false), true);
  assert.equal(wasCancelled(), true);

  assert.equal(gate.accept(true), false);
  assert.equal(gate.accept(true), false);
  assert.deepEqual(errors, [{ code: 'snapshot-from-cache' }]);

  assert.equal(gate.accept(false), true);
  assert.equal(gate.accept(true), false);
  assert.deepEqual(errors, [
    { code: 'snapshot-from-cache' },
    { code: 'snapshot-from-cache' },
  ]);
  gate.close();
});

test('stops accepting snapshots and cancels verification after close', () => {
  const { gate, errors, runTimeout, wasCancelled } = createHarness();

  gate.close();
  assert.equal(wasCancelled(), true);
  assert.equal(gate.accept(false), false);
  runTimeout();
  assert.deepEqual(errors, []);
});

test('validates required gate configuration', () => {
  assert.throws(() => createServerSnapshotGate(), /requires onUnverified/);
  assert.throws(
    () => createServerSnapshotGate({ onUnverified() {}, timeoutMs: 0 }),
    /positive number/,
  );
});
