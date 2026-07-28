import assert from 'node:assert/strict';
import test from 'node:test';

import { createGcpAccessTokenProvider } from './gcpOidc.js';

const NOW = Date.parse('2026-07-28T10:00:00.000Z');
const ENV = Object.freeze({
  GCP_PROJECT_NUMBER: '123456789012',
  GCP_WORKLOAD_IDENTITY_POOL_ID: 'vercel-pool',
  GCP_WORKLOAD_IDENTITY_PROVIDER_ID: 'vercel-provider',
  GCP_SERVICE_ACCOUNT_EMAIL: 'sentinel-reader@example-project.iam.gserviceaccount.com',
  VERCEL_OIDC_TOKEN: 'vercel-oidc-jwt',
});

function jsonResponse(status, body) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  };
}

test('Vercel OIDC exchanges through STS then impersonates the reader service account', async () => {
  const calls = [];
  const provider = createGcpAccessTokenProvider({
    env: ENV,
    now: () => NOW,
    fetchImpl: async (url, options) => {
      calls.push({ url, options });
      if (calls.length === 1) {
        return jsonResponse(200, { access_token: 'federated-token', expires_in: 3_600 });
      }
      return jsonResponse(200, {
        accessToken: 'impersonated-reader-token',
        expireTime: '2026-07-28T11:00:00.000Z',
      });
    },
  });

  assert.equal(await provider(), 'impersonated-reader-token');
  assert.equal(await provider(), 'impersonated-reader-token');
  assert.equal(calls.length, 2, 'warm invocation should reuse the short-lived access token');
  assert.equal(calls[0].url, 'https://sts.googleapis.com/v1/token');
  const exchange = new URLSearchParams(calls[0].options.body);
  assert.equal(exchange.get('subject_token'), ENV.VERCEL_OIDC_TOKEN);
  assert.equal(exchange.get('scope'), 'https://www.googleapis.com/auth/cloud-platform');
  assert.equal(
    exchange.get('audience'),
    '//iam.googleapis.com/projects/123456789012/locations/global/workloadIdentityPools/vercel-pool/providers/vercel-provider',
  );
  assert.match(calls[1].url, /sentinel-reader%40example-project\.iam\.gserviceaccount\.com/u);
  assert.equal(calls[1].options.headers.Authorization, 'Bearer federated-token');
  assert.deepEqual(JSON.parse(calls[1].options.body), {
    scope: ['https://www.googleapis.com/auth/datastore'],
    lifetime: '3600s',
  });
});

test('OIDC provider fails closed when deployment identity settings are absent', async () => {
  const provider = createGcpAccessTokenProvider({ env: {}, fetchImpl: async () => null });
  await assert.rejects(
    provider(),
    error => error.status === 503 && error.code === 'firestore-auth-not-configured',
  );
});
