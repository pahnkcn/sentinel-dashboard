import assert from 'node:assert/strict';
import test from 'node:test';

import { createFourColorTooltipRows } from './fourColorPresentation.js';

test('labels observed, carried-forward, and missing values explicitly', () => {
  const rows = createFourColorTooltipRows({
    self: 2,
    buddy: 3,
    command: null,
    isBuddyCF: true,
    buddySourceDate: '2026-05-12',
  });

  assert.deepEqual(rows, [
    { field: 'self', label: 'Self', value: 2, source: 'สังเกตจริง' },
    { field: 'buddy', label: 'Buddy', value: 3, source: 'CF จาก 2026-05-12' },
    { field: 'command', label: 'Command', value: null, source: 'ไม่มีข้อมูล' },
  ]);
});
