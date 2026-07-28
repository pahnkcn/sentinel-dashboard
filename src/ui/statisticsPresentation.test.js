import assert from 'node:assert/strict';
import test from 'node:test';

import {
  formatStandardDeviation,
  hasStatisticValue,
} from './statisticsPresentation.js';

test('keeps valid zero values and omits only missing statistics', () => {
  assert.equal(hasStatisticValue(0), true);
  assert.equal(hasStatisticValue(null), false);
  assert.equal(hasStatisticValue(undefined), false);
});

test('labels unavailable sample deviation without inventing zero variance', () => {
  assert.equal(formatStandardDeviation(null), 'n/a');
  assert.equal(formatStandardDeviation(0), '0');
  assert.equal(formatStandardDeviation(1.41), '1.41');
});
