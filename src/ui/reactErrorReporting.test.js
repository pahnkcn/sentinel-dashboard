import assert from 'node:assert/strict';
import test from 'node:test';

import { getReactFailureMessage } from './reactErrorReporting.js';

test('React failure messages never reflect arbitrary error details', () => {
  assert.equal(getReactFailureMessage('caught'), 'React render failure: caught');
  assert.equal(
    getReactFailureMessage('secret student@example.test'),
    'React render failure: unknown',
  );
});
