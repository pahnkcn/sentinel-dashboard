import assert from 'node:assert/strict';
import test from 'node:test';

import { decodeSnapshot } from './decodeSnapshot.js';

const acceptNamedRecords = ({ documentId, data }) => data.name
  ? { ok: true, value: { id: documentId, name: data.name } }
  : { ok: false, issues: [{ field: 'name', message: 'name is required' }] };

test('separates valid records from quarantined documents', () => {
  const snapshot = {
    docs: [
      { id: 'valid', data: () => ({ name: 'Allowed' }) },
      { id: 'invalid', data: () => ({}) },
    ],
  };

  assert.deepEqual(decodeSnapshot(snapshot, acceptNamedRecords), {
    records: [{ id: 'valid', name: 'Allowed' }],
    issues: [{
      documentId: 'invalid',
      issues: [{ field: 'name', message: 'name is required' }],
    }],
  });
});

test('quarantines unreadable documents without exposing thrown details', () => {
  const snapshot = {
    docs: [{
      id: 'broken',
      data: () => { throw new Error('sensitive raw payload'); },
    }],
  };

  const result = decodeSnapshot(snapshot, acceptNamedRecords);

  assert.deepEqual(result.records, []);
  assert.deepEqual(result.issues, [{
    documentId: 'broken',
    issues: [{ field: 'document', message: 'document could not be decoded' }],
  }]);
  assert.doesNotMatch(JSON.stringify(result), /sensitive raw payload/);
});
