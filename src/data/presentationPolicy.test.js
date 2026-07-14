import assert from 'node:assert/strict';
import test from 'node:test';

import { canPresentMonitoringAnalytics } from './presentationPolicy.js';

test('permits analytics only for a fully ready dataset', () => {
  assert.equal(canPresentMonitoringAnalytics('ready'), true);

  for (const status of ['idle', 'connecting', 'degraded', 'error', undefined]) {
    assert.equal(canPresentMonitoringAnalytics(status), false);
  }
});
