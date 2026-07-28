import assert from 'node:assert/strict';
import test from 'node:test';

import { getMonitoringFailurePresentation } from './monitoringFailurePresentation.js';

test('explains a missing emulator manifest with an actionable safe recovery', () => {
  const presentation = getMonitoringFailurePresentation({
    students: { code: 'dataset-manifest-missing', message: 'ignored detail' },
    logs: { code: 'dataset-manifest-missing' },
    assessments: { code: 'dataset-manifest-missing' },
  }, { useEmulators: true });

  assert.equal(presentation.title, 'ยังไม่มีชุดข้อมูลที่เผยแพร่');
  assert.match(presentation.recovery, /npm run emulators:seed/);
  assert.deepEqual(presentation.codes, ['dataset-manifest-missing']);
  assert.deepEqual(presentation.affectedStreams, ['students', 'logs', 'assessments']);
  assert.doesNotMatch(JSON.stringify(presentation), /ignored detail/);
});

test('prioritizes authorization failures when streams have mixed errors', () => {
  const presentation = getMonitoringFailurePresentation({
    students: { code: 'snapshot-from-cache' },
    logs: { code: 'permission-denied' },
    assessments: null,
  });

  assert.equal(presentation.title, 'ไม่มีสิทธิ์อ่านข้อมูลติดตาม');
  assert.deepEqual(presentation.codes, ['snapshot-from-cache', 'permission-denied']);
});

test('returns a bounded fallback without reflecting arbitrary error properties', () => {
  const presentation = getMonitoringFailurePresentation({
    logs: { code: 'unknown', detail: 'private@example.test' },
  });

  assert.equal(presentation.title, 'การเชื่อมต่อข้อมูลล้มเหลว');
  assert.deepEqual(presentation.codes, ['unknown']);
  assert.doesNotMatch(JSON.stringify(presentation), /private@example.test/);
});
