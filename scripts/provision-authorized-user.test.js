import assert from 'node:assert/strict';
import test from 'node:test';

import {
  authorizedUserDocumentId,
  normalizeEmail,
  provisionAuthorizedUser,
} from './provision-authorized-user.mjs';

function successfulResponse() {
  return {
    ok: true,
    status: 200,
    async json() { return {}; },
    async text() { return ''; },
  };
}

test('normalizes email before deriving the stable allowlist document ID', () => {
  assert.equal(normalizeEmail('  Demo.User@Example.COM '), 'demo.user@example.com');
  assert.equal(
    authorizedUserDocumentId('Demo.User@Example.COM'),
    authorizedUserDocumentId(' demo.user@example.com '),
  );
  assert.match(authorizedUserDocumentId('demo@example.com'), /^[a-f0-9]{64}$/);
});

test('provisioning is dry-run by default and accepts only exact roles', async () => {
  let requestCalls = 0;
  const summary = await provisionAuthorizedUser({
    email: 'demo@example.com',
    role: 'clinician',
    projectId: 'sentinel-demo-project',
    request: async () => {
      requestCalls += 1;
      return successfulResponse();
    },
  });
  assert.equal(summary.mode, 'dry-run');
  assert.equal(summary.enabled, true);
  assert.equal(requestCalls, 0);

  await assert.rejects(
    () => provisionAuthorizedUser({
      email: 'demo@example.com',
      role: 'viewer',
      projectId: 'sentinel-demo-project',
    }),
    /clinician or admin/,
  );
});

test('commit writes the normalized allowlist document with operator credentials', async () => {
  const requests = [];
  const summary = await provisionAuthorizedUser({
    email: ' Admin@Example.com ',
    role: 'admin',
    enabled: false,
    projectId: 'sentinel-demo-project',
    commit: true,
    getAccessToken: async () => 'operator-token',
    request: async (url, options) => {
      requests.push({ url, options });
      return successfulResponse();
    },
    clock: () => new Date('2026-07-28T01:02:03.000Z'),
  });

  assert.equal(summary.email, 'admin@example.com');
  assert.equal(summary.enabled, false);
  assert.equal(requests.length, 1);
  const body = JSON.parse(requests[0].options.body);
  const write = body.writes[0];
  assert.match(write.update.name, /\/authorizedUsers\/[a-f0-9]{64}$/);
  assert.equal(write.update.fields.email.stringValue, 'admin@example.com');
  assert.equal(write.update.fields.role.stringValue, 'admin');
  assert.equal(write.update.fields.enabled.booleanValue, false);
  assert.equal(requests[0].options.headers.Authorization, 'Bearer operator-token');
});
